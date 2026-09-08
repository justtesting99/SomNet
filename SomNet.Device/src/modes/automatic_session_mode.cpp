#include "modes/automatic_session_mode.h"

#include "config.h"
#include "modes/automatic/automatic_config.h"
#include "modes/automatic/automatic_program_base.h"
#include "modes/automatic/automatic_program_factory.h"
#include "power_timing.h"
#include "relay_controller.h"

#include <Arduino.h>
#include <stdio.h>
#include <string.h>

namespace {

constexpr unsigned long kMsPerMinute = 60UL * 1000UL;
constexpr unsigned long kMaxAutomaticSessionMs = 24UL * 60UL * 60UL * 1000UL;

int endSessionModeToWire(EndSessionMode mode) {
    switch (mode) {
        case EndSessionMode::Minutes:
            return 1;
        case EndSessionMode::Strokes:
            return 2;
        default:
            return 0;
    }
}

} // namespace

void AutomaticSessionMode::setRelay(RelayController* relay) {
    relay_ = relay;
}

void AutomaticSessionMode::start(const char* /*payloadJson*/) {
    // Use beginSession() — IExecutionMode entry point reserved for future wiring.
}

bool AutomaticSessionMode::beginSession(const char* payloadJson) {
    if (relay_ == nullptr || active_) {
        return false;
    }

    AutomaticConfig config{};
    if (!parseAutomaticConfig(payloadJson, &config)) {
        return false;
    }

    destroyAutomaticProgram(program_);
    program_ = createAutomaticProgram(config);
    if (program_ == nullptr) {
        return false;
    }

    strncpy(configJson_, payloadJson != nullptr ? payloadJson : "{}", sizeof(configJson_) - 1);
    configJson_[sizeof(configJson_) - 1] = '\0';
    minimumStrokeMs_ = config.minimumStrokeMs;
    maximumStrokeMs_ = config.maximumStrokeMs;
    endSessionValue_ = config.endSessionValue;
    endSessionMode_ = endSessionModeToWire(config.endSessionMode);
    burstsOn_ = config.burstsOn;
    buildAutomaticBurstPlan(config, &burstPlan_);

    switch (config.mode) {
        case AutomaticRunMode::Periodic:
            strncpy(automaticMode_, "periodic", sizeof(automaticMode_) - 1);
            break;
        case AutomaticRunMode::RandomPowerOnly:
            strncpy(automaticMode_, "randomPowerOnly", sizeof(automaticMode_) - 1);
            break;
        case AutomaticRunMode::RandomTimingOnly:
            strncpy(automaticMode_, "randomTimingOnly", sizeof(automaticMode_) - 1);
            break;
        case AutomaticRunMode::RandomPowerAndTiming:
            strncpy(automaticMode_, "randomPowerAndTiming", sizeof(automaticMode_) - 1);
            break;
        case AutomaticRunMode::PowerWave:
            strncpy(automaticMode_, "powerWave", sizeof(automaticMode_) - 1);
            break;
        case AutomaticRunMode::PowerAndTimingWave:
            strncpy(automaticMode_, "powerAndTimingWave", sizeof(automaticMode_) - 1);
            break;
        case AutomaticRunMode::BuildUp:
            strncpy(automaticMode_, "buildUp", sizeof(automaticMode_) - 1);
            break;
        default:
            strncpy(automaticMode_, "unknown", sizeof(automaticMode_) - 1);
            break;
    }
    automaticMode_[sizeof(automaticMode_) - 1] = '\0';

    strokesCompleted_ = 0;
    burstEventsCompleted_ = 0;
    intraBurstStrokesCompleted_ = 0;
    burstStrokesTarget_ = 0;
    burstStrokesCompletedInEvent_ = 0;
    postBurstGapSec_ = 0;
    burstDelayMs_ = 0;
    burstGapStartMs_ = 0;
    strokeMs_ = 0;
    powerPercent_ = 0;
    gapSec_ = 0;
    stopRequested_ = false;
    stopCorrelationId_[0] = '\0';
    callbackContext_ = nullptr;
    onComplete_ = nullptr;
    resultJson_[0] = '\0';
    sessionStartMs_ = 0;
    delayStartMs_ = millis();
    nextGapDeadlineMs_ = 0;
    active_ = true;

    Serial.print(F("[AUTO] start mode="));
    Serial.print(automaticMode_);
    Serial.print(F(" delaySec="));
    Serial.print(config.delayBeforeStartSeconds);
    Serial.println(F(" (stroke-first)"));

    if (burstsOn_) {
        if (burstPlan_.active) {
            switch (burstPlan_.kind) {
                case BurstScheduleKind::StrokeMilestones:
                    Serial.print(F("[AUTO] burst plan strokes events="));
                    Serial.println(burstPlan_.burstEventCount);
                    break;
                case BurstScheduleKind::WallClockDeadlines:
                    Serial.print(F("[AUTO] burst plan minutes events="));
                    Serial.println(burstPlan_.burstEventCount);
                    break;
                case BurstScheduleKind::CadenceStride:
                    Serial.print(F("[AUTO] burst plan noAutoEnd stride="));
                    Serial.println(burstPlan_.cadenceStride);
                    break;
                default:
                    Serial.println(F("[AUTO] burst plan active"));
                    break;
            }
        } else {
            Serial.println(F("[AUTO] burstsOn=true (no burst schedule - check percent/end rule)"));
        }
    }

    if (config.delayBeforeStartSeconds > 0) {
        state_ = State::StartDelay;
    } else {
        sessionStartMs_ = millis();
        if (!startNextPulse()) {
            active_ = false;
            state_ = State::Idle;
            destroyAutomaticProgram(program_);
            program_ = nullptr;
            return false;
        }
    }

    return true;
}

void AutomaticSessionMode::setSessionNotifier(
    void* callbackContext,
    AutomaticCompleteCallback onNotify) {
    sessionNotifyContext_ = callbackContext;
    sessionNotify_ = onNotify;
}

bool AutomaticSessionMode::requestStop(
    const char* correlationId,
    void* callbackContext,
    AutomaticCompleteCallback onComplete) {
    if (!active_ || correlationId == nullptr || correlationId[0] == '\0' || onComplete == nullptr) {
        return false;
    }

    if (stopRequested_) {
        return false;
    }

    strncpy(stopCorrelationId_, correlationId, sizeof(stopCorrelationId_) - 1);
    stopCorrelationId_[sizeof(stopCorrelationId_) - 1] = '\0';
    callbackContext_ = callbackContext;
    onComplete_ = onComplete;
    stopRequested_ = true;

    Serial.println(F("[AUTO] stop requested"));
    return true;
}

bool AutomaticSessionMode::queueSessionUpdate(const char* payloadJson) {
    if (!active_) {
        return false;
    }

    AutomaticConfig config{};
    if (!parseAutomaticConfig(payloadJson, &config)) {
        Serial.println(F("[AUTO] update rejected — invalid payload"));
        return false;
    }

    Serial.print(F("[AUTO] update received (Phase 11A — replan deferred) mainStrokes="));
    Serial.print(strokesCompleted_);
    Serial.print(F(" burstsOn="));
    Serial.println(config.burstsOn ? F("true") : F("false"));
    return true;
}

void AutomaticSessionMode::poll() {
    if (!active_) {
        return;
    }

    if (state_ == State::StartDelay) {
        AutomaticConfig config{};
        if (!parseAutomaticConfig(configJson_, &config)) {
            finishSession(false, "automatic config invalid", "error", true);
            return;
        }

        const unsigned long delayMs = static_cast<unsigned long>(config.delayBeforeStartSeconds) * 1000UL;
        if (millis() - delayStartMs_ < delayMs) {
            return;
        }

        sessionStartMs_ = millis();
        Serial.println(F("[AUTO] start delay complete"));
        if (!startNextPulse()) {
            finishSession(false, "automatic session failed — relay busy", "error", true);
        }
        return;
    }

    if (state_ == State::BurstGap) {
        if (millis() - burstGapStartMs_ < burstDelayMs_) {
            return;
        }

        if (!startNextBurstPulse()) {
            finishSession(false, "automatic burst failed — relay busy", "error", true);
        }
        return;
    }

    if (state_ != State::WaitingGap) {
        return;
    }

    if (stopRequested_) {
        finishSession(true, "automatic session stopped", "manualStop", false);
        return;
    }

    // P10-D23: minutes burst deadline before end-session check on this pass.
    if (burstsOn_ &&
        shouldTriggerBurstInWaitingGap(burstPlan_, sessionStartMs_, millis())) {
        if (!beginBurstEvent()) {
            finishSession(false, "automatic burst failed to start", "error", true);
        }
        return;
    }

    if (shouldEndSession()) {
        finishSession(true, "automatic session complete", "endSession", false);
        return;
    }

    if (millis() < nextGapDeadlineMs_) {
        return;
    }

    if (!startNextPulse()) {
        finishSession(false, "automatic session failed — relay busy", "error", true);
    }
}

bool AutomaticSessionMode::startNextPulse() {
    if (relay_ == nullptr || program_ == nullptr || !active_) {
        return false;
    }

    AutomaticConfig config{};
    if (!parseAutomaticConfig(configJson_, &config)) {
        return false;
    }

    program_->getStrokeParameters(strokesCompleted_, config, powerPercent_, gapSec_);
    strokeMs_ = strokeMsFromPower(powerPercent_, minimumStrokeMs_, maximumStrokeMs_);

    if (strokeMs_ <= 0 || strokeMs_ > static_cast<int>(kMaxStrokeMs)) {
        Serial.println(F("[AUTO] reject: strokeMs out of range"));
        return false;
    }

    if (gapSec_ < 0) {
        gapSec_ = 0;
    }

    state_ = State::Pulse;

    Serial.print(F("[AUTO] pulse power="));
    Serial.print(powerPercent_);
    Serial.print(F("% strokeMs="));
    Serial.print(strokeMs_);
    Serial.print(F(" gapSec="));
    Serial.println(gapSec_);

    if (!relay_->requestPulse(
            static_cast<unsigned long>(strokeMs_),
            this,
            &AutomaticSessionMode::onRelayPulseComplete)) {
        Serial.println(F("[AUTO] reject: relay busy"));
        state_ = State::WaitingGap;
        return false;
    }

    return true;
}

bool AutomaticSessionMode::beginBurstEvent() {
    AutomaticConfig config{};
    if (!parseAutomaticConfig(configJson_, &config)) {
        return false;
    }

    if (program_ != nullptr) {
        int dummyPower = 0;
        program_->getStrokeParameters(strokesCompleted_, config, dummyPower, postBurstGapSec_);
    } else {
        postBurstGapSec_ = gapSec_;
    }
    if (postBurstGapSec_ < 0) {
        postBurstGapSec_ = 0;
    }

    burstStrokesTarget_ = drawBurstStrokeCount(config);
    burstStrokesCompletedInEvent_ = 0;

    Serial.print(F("[AUTO] burst start event="));
    Serial.print(burstEventsCompleted_ + 1);
    Serial.print(F(" strokes="));
    Serial.println(burstStrokesTarget_);

    return startNextBurstPulse();
}

bool AutomaticSessionMode::startNextBurstPulse() {
    if (relay_ == nullptr || !active_) {
        return false;
    }

    AutomaticConfig config{};
    if (!parseAutomaticConfig(configJson_, &config)) {
        return false;
    }

    const int burstRelativePower = drawBurstRelativePower(config);
    powerPercent_ = resolveBurstEffectivePower(burstRelativePower, config);
    strokeMs_ = strokeMsFromPower(powerPercent_, minimumStrokeMs_, maximumStrokeMs_);

    if (strokeMs_ <= 0 || strokeMs_ > static_cast<int>(kMaxStrokeMs)) {
        Serial.println(F("[AUTO] reject: burst strokeMs out of range"));
        return false;
    }

    state_ = State::BurstPulse;

    Serial.print(F("[AUTO] burst pulse "));
    Serial.print(burstStrokesCompletedInEvent_ + 1);
    Serial.print(F("/"));
    Serial.print(burstStrokesTarget_);
    Serial.print(F(" power="));
    Serial.print(powerPercent_);
    Serial.print(F("% strokeMs="));
    Serial.println(strokeMs_);

    if (!relay_->requestPulse(
            static_cast<unsigned long>(strokeMs_),
            this,
            &AutomaticSessionMode::onBurstPulseComplete)) {
        Serial.println(F("[AUTO] reject: relay busy"));
        state_ = State::WaitingGap;
        return false;
    }

    return true;
}

void AutomaticSessionMode::finishBurstEvent() {
    burstEventsCompleted_++;
    advanceBurstPlan(&burstPlan_);

    Serial.print(F("[AUTO] burst event complete total="));
    Serial.println(burstEventsCompleted_);

    if (stopRequested_) {
        finishSession(true, "automatic session stopped", "manualStop", false);
        return;
    }

    if (shouldEndSession()) {
        finishSession(true, "automatic session complete", "endSession", false);
        return;
    }

    state_ = State::WaitingGap;
    nextGapDeadlineMs_ = millis() + static_cast<unsigned long>(postBurstGapSec_) * 1000UL;
}

void AutomaticSessionMode::onRelayPulseComplete(void* context, unsigned long /*actualMs*/) {
    if (context == nullptr) {
        return;
    }

    auto* mode = static_cast<AutomaticSessionMode*>(context);
    if (!mode->active_ || mode->state_ != State::Pulse) {
        return;
    }

    mode->strokesCompleted_++;
    Serial.print(F("[AUTO] stroke complete count="));
    Serial.println(mode->strokesCompleted_);

    if (mode->burstsOn_ &&
        shouldTriggerBurstAfterMainStroke(mode->burstPlan_, mode->strokesCompleted_)) {
        if (!mode->beginBurstEvent()) {
            mode->finishSession(false, "automatic burst failed to start", "error", true);
        }
        return;
    }

    if (mode->stopRequested_) {
        mode->finishSession(true, "automatic session stopped", "manualStop", false);
        return;
    }

    if (mode->shouldEndSession()) {
        mode->finishSession(true, "automatic session complete", "endSession", false);
        return;
    }

    mode->state_ = State::WaitingGap;
    mode->nextGapDeadlineMs_ = millis() + static_cast<unsigned long>(mode->gapSec_) * 1000UL;
}

void AutomaticSessionMode::onBurstPulseComplete(void* context, unsigned long /*actualMs*/) {
    if (context == nullptr) {
        return;
    }

    auto* mode = static_cast<AutomaticSessionMode*>(context);
    if (!mode->active_ || mode->state_ != State::BurstPulse) {
        return;
    }

    mode->burstStrokesCompletedInEvent_++;
    mode->intraBurstStrokesCompleted_++;

    if (mode->burstStrokesCompletedInEvent_ >= mode->burstStrokesTarget_) {
        mode->finishBurstEvent();
        return;
    }

    AutomaticConfig config{};
    if (!parseAutomaticConfig(mode->configJson_, &config)) {
        mode->finishSession(false, "automatic config invalid", "error", true);
        return;
    }

    const int delaySec = drawBurstDelaySec(config);
    mode->burstDelayMs_ = static_cast<unsigned long>(delaySec) * 1000UL;

    if (mode->burstDelayMs_ == 0) {
        if (!mode->startNextBurstPulse()) {
            mode->finishSession(false, "automatic burst failed — relay busy", "error", true);
        }
        return;
    }

    mode->state_ = State::BurstGap;
    mode->burstGapStartMs_ = millis();
}

bool AutomaticSessionMode::shouldEndSession() const {
    if (endSessionMode_ == endSessionModeToWire(EndSessionMode::Strokes)) {
        return endSessionValue_ > 0 && strokesCompleted_ >= endSessionValue_;
    }

    if (endSessionMode_ == endSessionModeToWire(EndSessionMode::Minutes)) {
        if (endSessionValue_ <= 0 || sessionStartMs_ == 0) {
            return false;
        }

        const unsigned long elapsedMs = millis() - sessionStartMs_;
        if (elapsedMs >= kMaxAutomaticSessionMs) {
            return true;
        }

        return elapsedMs >= static_cast<unsigned long>(endSessionValue_) * kMsPerMinute;
    }

    return false;
}

void AutomaticSessionMode::buildResultJson(const char* endReason, bool interrupted) {
    const unsigned long durationMs =
        sessionStartMs_ == 0 ? 0 : millis() - sessionStartMs_;

    if (burstsOn_) {
        snprintf(
            resultJson_,
            sizeof(resultJson_),
            "{\"commandKey\":\"automatic-stop\",\"automaticMode\":\"%s\",\"powerPercent\":%d,"
            "\"strokeMs\":%d,\"gapSec\":%d,\"burstsOn\":true,"
            "\"mainStrokesCompleted\":%d,\"burstEventsCompleted\":%d,"
            "\"strokesCompleted\":%d,\"intraBurstStrokesCompleted\":%d,"
            "\"durationMs\":%lu,\"endSessionMode\":%d,\"endSessionValue\":%d,"
            "\"interrupted\":%s,\"endReason\":\"%s\"}",
            automaticMode_,
            powerPercent_,
            strokeMs_,
            gapSec_,
            strokesCompleted_,
            burstEventsCompleted_,
            strokesCompleted_,
            intraBurstStrokesCompleted_,
            durationMs,
            endSessionMode_,
            endSessionValue_,
            interrupted ? "true" : "false",
            endReason != nullptr ? endReason : "");
        return;
    }

    snprintf(
        resultJson_,
        sizeof(resultJson_),
        "{\"commandKey\":\"automatic-stop\",\"automaticMode\":\"%s\",\"powerPercent\":%d,"
        "\"strokeMs\":%d,\"gapSec\":%d,\"strokesCompleted\":%d,\"durationMs\":%lu,"
        "\"endSessionMode\":%d,\"endSessionValue\":%d,\"interrupted\":%s,\"endReason\":\"%s\"}",
        automaticMode_,
        powerPercent_,
        strokeMs_,
        gapSec_,
        strokesCompleted_,
        durationMs,
        endSessionMode_,
        endSessionValue_,
        interrupted ? "true" : "false",
        endReason != nullptr ? endReason : "");
}

void AutomaticSessionMode::finishSession(
    bool success,
    const char* message,
    const char* endReason,
    bool interrupted) {
    if (!active_) {
        return;
    }

    buildResultJson(endReason, interrupted);

    active_ = false;
    state_ = State::Idle;

    Serial.print(F("[AUTO] complete success="));
    Serial.print(success ? F("true") : F("false"));
    Serial.print(F(" reason="));
    Serial.println(endReason != nullptr ? endReason : "");

    if (stopRequested_ && onComplete_ != nullptr && stopCorrelationId_[0] != '\0') {
        onComplete_(callbackContext_, stopCorrelationId_, success, message, resultJson_);
    }

    // Hub notify for end-rule, abort, and manual stop (P10-D3 mid-burst UI finalize).
    if (sessionNotify_ != nullptr &&
        sessionNotifyContext_ != nullptr &&
        resultJson_[0] != '\0') {
        sessionNotify_(
            sessionNotifyContext_,
            kAutomaticSessionCompleteCorrelationId,
            success,
            message,
            resultJson_);
    }

    stopRequested_ = false;
    onComplete_ = nullptr;
    callbackContext_ = nullptr;
    sessionNotifyContext_ = nullptr;
    sessionNotify_ = nullptr;
    stopCorrelationId_[0] = '\0';
    strokesCompleted_ = 0;
    burstEventsCompleted_ = 0;
    intraBurstStrokesCompleted_ = 0;
    burstStrokesTarget_ = 0;
    burstStrokesCompletedInEvent_ = 0;
    burstsOn_ = false;
    burstPlan_ = AutomaticBurstPlan{};
    sessionStartMs_ = 0;
    delayStartMs_ = 0;
    nextGapDeadlineMs_ = 0;

    destroyAutomaticProgram(program_);
    program_ = nullptr;
}

void AutomaticSessionMode::abort() {
    if (!active_) {
        return;
    }

    Serial.println(F("[AUTO] aborted"));

    if ((state_ == State::Pulse || state_ == State::BurstPulse) && relay_ != nullptr) {
        relay_->abort();
    }

    finishSession(false, "automatic session aborted", "abort", true);
}

bool AutomaticSessionMode::isActive() const {
    return active_;
}
