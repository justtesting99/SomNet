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

    if (state_ != State::WaitingGap) {
        return;
    }

    if (stopRequested_) {
        finishSession(true, "automatic session stopped", "manualStop", false);
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

    stopRequested_ = false;
    onComplete_ = nullptr;
    callbackContext_ = nullptr;
    stopCorrelationId_[0] = '\0';
    strokesCompleted_ = 0;
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

    if (state_ == State::Pulse && relay_ != nullptr) {
        relay_->abort();
    }

    finishSession(false, "automatic session aborted", "abort", true);
}

bool AutomaticSessionMode::isActive() const {
    return active_;
}
