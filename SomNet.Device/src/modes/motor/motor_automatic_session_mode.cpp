#include "modes/motor/motor_automatic_session_mode.h"

#include "modes/automatic/automatic_config.h"
#include "modes/motor/motor_automatic_burst.h"
#include "modes/motor/motor_automatic_config.h"
#include "motor_controller.h"

#include <Arduino.h>
#include <esp_random.h>
#include <stdio.h>
#include <string.h>

namespace {

constexpr unsigned long kMsPerMinute = 60UL * 1000UL;
constexpr unsigned long kMaxAutomaticSessionMs = 24UL * 60UL * 60UL * 1000UL;

} // namespace

void MotorAutomaticSessionMode::setMotor(MotorController* motor) {
    motor_ = motor;
}

bool MotorAutomaticSessionMode::beginSession(const char* payloadJson) {
    if (motor_ == nullptr || active_) {
        return false;
    }

    MotorAutomaticConfig config{};
    if (!parseMotorAutomaticConfig(payloadJson, &config)) {
        return false;
    }

    strncpy(configJson_, payloadJson != nullptr ? payloadJson : "{}", sizeof(configJson_) - 1);
    configJson_[sizeof(configJson_) - 1] = '\0';
    pendingConfigJson_[0] = '\0';
    pendingUpdate_ = false;

    stopRampMs_ = static_cast<unsigned long>(config.rampMs);
    endSessionValue_ = config.endSessionValue;
    endSessionModeWire_ = motorEndSessionModeToWire(config.endSessionMode);
    burstsOn_ = config.burstsOn;
    burstEventsCompleted_ = 0;
    burstStrokesTarget_ = 0;
    burstStrokesCompletedInEvent_ = 0;
    rebuildBurstPlan();
    segmentsCompleted_ = 0;
    dutyPercent_ = 0;
    lastCommandedSpeedPercent_ = 0;
    burstMicroHoldTelemetryPendingMs_ = 0;
    stopRequested_ = false;
    stopCorrelationId_[0] = '\0';
    callbackContext_ = nullptr;
    onComplete_ = nullptr;
    resultJson_[0] = '\0';
    sessionStartMs_ = 0;
    phaseDeadlineMs_ = 0;
    delayStartMs_ = millis();
    active_ = true;

    Serial.print(F("[MOTOR-AUTO] start delaySec="));
    Serial.print(config.delayBeforeStartSeconds);
    Serial.print(F(" burstsOn="));
    Serial.println(burstsOn_ ? F("true") : F("false"));
    Serial.print(F("[MOTOR-AUTO] segmentTargetRampMs="));
    Serial.println(config.segmentTargetRampMs);
    if (burstsOn_) {
        Serial.print(F("[MOTOR-AUTO] burst strokePowerMax="));
        Serial.print(config.burstStrokePowerMax);
        Serial.print(F(" min="));
        Serial.print(config.burstStrokePowerMin);
        Serial.print(F(" speedBand="));
        Serial.print(config.minimumSpeedPercent);
        Serial.print(F("-"));
        Serial.println(config.maximumSpeedPercent);
    }
    if (burstsOn_ && burstPlan_.active) {
        if (burstPlan_.burstInsteadOfMain) {
            Serial.println(F("[MOTOR-AUTO] burst timing=insteadOfMain"));
        }
        if (burstPlan_.kind == BurstScheduleKind::ChancePerMainStroke) {
            Serial.print(F("[MOTOR-AUTO] burst plan chance percent="));
            Serial.println(config.burstPercent);
        }
    }

    if (config.delayBeforeStartSeconds > 0) {
        state_ = State::StartDelay;
        phaseDeadlineMs_ = delayStartMs_ + static_cast<unsigned long>(config.delayBeforeStartSeconds) * 1000UL;
    } else {
        sessionStartMs_ = millis();
        if (!tryContinueProgramAfterGap()) {
            active_ = false;
            state_ = State::Idle;
            return false;
        }
    }

    return true;
}

bool MotorAutomaticSessionMode::queueSessionUpdate(const char* payloadJson) {
    if (!active_) {
        return false;
    }

    MotorAutomaticConfig config{};
    if (!parseMotorAutomaticConfig(payloadJson, &config)) {
        Serial.println(F("[MOTOR-AUTO] update rejected — invalid payload"));
        return false;
    }

    strncpy(pendingConfigJson_, payloadJson != nullptr ? payloadJson : "{}", sizeof(pendingConfigJson_) - 1);
    pendingConfigJson_[sizeof(pendingConfigJson_) - 1] = '\0';
    pendingUpdate_ = true;

    Serial.print(F("[MOTOR-AUTO] update queued segments="));
    Serial.println(segmentsCompleted_);
    return true;
}

bool MotorAutomaticSessionMode::applyPendingUpdate() {
    if (!pendingUpdate_ || pendingConfigJson_[0] == '\0') {
        return false;
    }

    MotorAutomaticConfig config{};
    if (!parseMotorAutomaticConfig(pendingConfigJson_, &config)) {
        pendingUpdate_ = false;
        pendingConfigJson_[0] = '\0';
        Serial.println(F("[MOTOR-AUTO] update rejected — invalid payload"));
        return false;
    }

    strncpy(configJson_, pendingConfigJson_, sizeof(configJson_) - 1);
    configJson_[sizeof(configJson_) - 1] = '\0';
    stopRampMs_ = static_cast<unsigned long>(config.rampMs);
    endSessionValue_ = config.endSessionValue;
    endSessionModeWire_ = motorEndSessionModeToWire(config.endSessionMode);
    pendingUpdate_ = false;
    pendingConfigJson_[0] = '\0';

    if (state_ == State::StartDelay) {
        phaseDeadlineMs_ =
            delayStartMs_ + static_cast<unsigned long>(config.delayBeforeStartSeconds) * 1000UL;
    }

    const bool cancelBurst =
        !config.burstsOn &&
        (state_ == State::BurstMicroRamp || state_ == State::BurstHold || state_ == State::BurstGap);

    burstsOn_ = config.burstsOn;
    rebuildBurstPlan();

    if (cancelBurst) {
        burstStrokesTarget_ = 0;
        burstStrokesCompletedInEvent_ = 0;
        if (resumeState_ == State::SetSpeedHold) {
            state_ = State::SetSpeedHold;
        } else if (!tryContinueProgramAfterGap()) {
            finishSession(false, "automatic session failed", "error", true);
            return true;
        }
    }

    Serial.print(F("[MOTOR-AUTO] update applied segments="));
    Serial.println(segmentsCompleted_);
    return true;
}

void MotorAutomaticSessionMode::setSessionNotifier(
    void* callbackContext,
    AutomaticCompleteCallback onNotify) {
    sessionNotifyContext_ = callbackContext;
    sessionNotify_ = onNotify;
}

void MotorAutomaticSessionMode::setSegmentNotifier(
    void* callbackContext,
    MotorAutomaticSegmentCallback onNotify) {
    segmentNotifyContext_ = callbackContext;
    segmentNotify_ = onNotify;
}

void MotorAutomaticSessionMode::emitSegmentRamp(
    int segmentIndex,
    int fromSpeedPercent,
    int toSpeedPercent,
    unsigned long durationMs) {
    if (segmentNotify_ == nullptr || segmentNotifyContext_ == nullptr || !active_) {
        return;
    }

    const unsigned long programElapsedMs =
        delayStartMs_ > 0UL ? millis() - delayStartMs_ : 0UL;

    char segmentJson[320];
    snprintf(
        segmentJson,
        sizeof(segmentJson),
        "{\"commandKey\":\"motor-automatic-segment\",\"actuatorKind\":\"hbridge\","
        "\"segmentIndex\":%d,\"fromSpeedPercent\":%d,\"toSpeedPercent\":%d,"
        "\"durationMs\":%lu,\"programElapsedMs\":%lu}",
        segmentIndex,
        fromSpeedPercent,
        toSpeedPercent,
        durationMs,
        programElapsedMs);
    segmentNotify_(segmentNotifyContext_, segmentJson);
    lastCommandedSpeedPercent_ = toSpeedPercent;
}

bool MotorAutomaticSessionMode::requestStop(
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
    Serial.println(F("[MOTOR-AUTO] stop requested"));
    return true;
}

int MotorAutomaticSessionMode::pickSegmentSeconds() const {
    MotorAutomaticConfig config{};
    if (!parseMotorAutomaticConfig(configJson_, &config)) {
        return 5;
    }
    if (config.mode == MotorAutomaticRunMode::Periodic ||
        config.mode == MotorAutomaticRunMode::RandomSpeed ||
        config.mode == MotorAutomaticRunMode::PowerWave ||
        config.mode == MotorAutomaticRunMode::BuildUp) {
        return config.segmentMaxSeconds;
    }
    if (config.segmentMinSeconds >= config.segmentMaxSeconds) {
        return config.segmentMinSeconds;
    }
    const int span = config.segmentMaxSeconds - config.segmentMinSeconds + 1;
    return config.segmentMinSeconds + static_cast<int>(esp_random() % static_cast<uint32_t>(span));
}

bool MotorAutomaticSessionMode::beginSetSpeedHold() {
    if (motor_ == nullptr || !active_) {
        return false;
    }

    MotorAutomaticConfig config{};
    if (!parseMotorAutomaticConfig(configJson_, &config)) {
        return false;
    }

    if (config.mode != MotorAutomaticRunMode::Periodic) {
        return false;
    }

    const int toSpeedPercent =
        motorResolveSpeedPercentForSegment(config, 0, sessionStartMs_, millis());
    dutyPercent_ = motorSpeedPercentToDuty(toSpeedPercent, config);
    const unsigned long rampMs = periodicInitialRampMs(config);

    if (!motor_->beginRampToDuty(dutyPercent_, rampMs)) {
        Serial.println(F("[MOTOR-AUTO] reject: motor busy"));
        return false;
    }

    state_ = State::SetSpeedHold;
    segmentsCompleted_ = 1;

    emitSegmentRamp(0, 0, toSpeedPercent, rampMs);

    Serial.print(F("[MOTOR-AUTO] set-speed hold duty="));
    Serial.print(dutyPercent_);
    Serial.print(F("% rampMs="));
    Serial.println(rampMs);
    return true;
}

bool MotorAutomaticSessionMode::beginSegmentTransition() {
    if (motor_ == nullptr || !active_) {
        return false;
    }

    MotorAutomaticConfig config{};
    if (!parseMotorAutomaticConfig(configJson_, &config)) {
        return false;
    }

    if (config.mode == MotorAutomaticRunMode::Periodic) {
        return beginSetSpeedHold();
    }

    const unsigned long nowMs = millis();
    segmentDurationMs_ = static_cast<unsigned long>(pickSegmentSeconds()) * 1000UL;
    if (segmentDurationMs_ < 1UL) {
        segmentDurationMs_ = 1UL;
    }

    const int fromSpeedPercent =
        segmentsCompleted_ == 0
            ? 0
            : motorResolveSpeedPercentForSegment(config, segmentsCompleted_ - 1, sessionStartMs_, nowMs);
    const int toSpeedPercent =
        motorResolveSpeedPercentForSegment(config, segmentsCompleted_, sessionStartMs_, nowMs);

    const int fromDuty =
        segmentsCompleted_ == 0 ? 0 : motorSpeedPercentToDuty(fromSpeedPercent, config);
    const int toDuty = motorSpeedPercentToDuty(toSpeedPercent, config);
    dutyPercent_ = toDuty;

    segmentHoldDeadlineMs_ = millis() + segmentDurationMs_;
    unsigned long transitionMs = segmentTransitionRampMs(config);
    if (transitionMs > segmentDurationMs_) {
        transitionMs = segmentDurationMs_;
    }

    if (!motor_->beginRampToDuty(toDuty, transitionMs)) {
        Serial.println(F("[MOTOR-AUTO] reject: motor busy"));
        return false;
    }

    state_ = State::SegmentRamp;

    segmentHoldTelemetryPendingMs_ = 0;
    if (transitionMs == 0) {
        emitSegmentRamp(
            segmentsCompleted_,
            toSpeedPercent,
            toSpeedPercent,
            segmentDurationMs_);
    } else if (transitionMs >= segmentDurationMs_) {
        emitSegmentRamp(
            segmentsCompleted_,
            fromSpeedPercent,
            toSpeedPercent,
            segmentDurationMs_);
    } else {
        emitSegmentRamp(
            segmentsCompleted_,
            fromSpeedPercent,
            toSpeedPercent,
            transitionMs);
        segmentHoldTelemetryPendingMs_ = segmentDurationMs_ - transitionMs;
        segmentHoldTelemetrySpeedPercent_ = toSpeedPercent;
    }

    Serial.print(F("[MOTOR-AUTO] segment #"));
    Serial.print(segmentsCompleted_);
    Serial.print(F(" duty "));
    Serial.print(fromDuty);
    Serial.print(F("% -> "));
    Serial.print(toDuty);
    Serial.print(F("% rampMs="));
    Serial.print(transitionMs);
    Serial.print(F(" holdMs="));
    Serial.println(segmentDurationMs_);
    return true;
}

void MotorAutomaticSessionMode::requestRampToStop() {
    if (motor_ == nullptr) {
        return;
    }
    const unsigned long rampMs = stopRampMs_ > 0UL ? stopRampMs_ : 1UL;
    motor_->beginRampToDuty(0, rampMs);
    state_ = State::RampToStop;
}

bool MotorAutomaticSessionMode::shouldEndSession() const {
    if (endSessionModeWire_ != motorEndSessionModeToWire(MotorEndSessionMode::Minutes)) {
        return false;
    }
    if (endSessionValue_ <= 0 || sessionStartMs_ == 0) {
        return false;
    }

    const unsigned long elapsedMs = millis() - sessionStartMs_;
    if (elapsedMs >= kMaxAutomaticSessionMs) {
        return true;
    }
    return elapsedMs >= static_cast<unsigned long>(endSessionValue_) * kMsPerMinute;
}

void MotorAutomaticSessionMode::buildResultJson(const char* endReason, bool interrupted) {
    const unsigned long durationMs =
        sessionStartMs_ == 0 ? 0 : millis() - sessionStartMs_;

    MotorAutomaticConfig config{};
    const char* modeWire = "periodic";
    const char* placementWire = "mainPlusSessionSpread";
    if (loadConfig(&config)) {
        modeWire = motorAutomaticRunModeToWire(config.mode);
        if (burstsOn_) {
            placementWire = burstPlacementToWire(config.burstPlacement);
        }
    }

    if (burstsOn_) {
        snprintf(
            resultJson_,
            sizeof(resultJson_),
            "{\"commandKey\":\"automatic-stop\",\"actuatorKind\":\"hbridge\","
            "\"automaticMode\":\"%s\",\"dutyPercent\":%d,\"burstsOn\":true,"
            "\"segmentsCompleted\":%d,\"burstEventsCompleted\":%d,"
            "\"burstPlacement\":\"%s\","
            "\"durationMs\":%lu,\"endSessionMode\":%d,\"endSessionValue\":%d,"
            "\"interrupted\":%s,\"endReason\":\"%s\"}",
            modeWire,
            dutyPercent_,
            segmentsCompleted_,
            burstEventsCompleted_,
            placementWire,
            durationMs,
            endSessionModeWire_,
            endSessionValue_,
            interrupted ? "true" : "false",
            endReason != nullptr ? endReason : "");
        return;
    }

    snprintf(
        resultJson_,
        sizeof(resultJson_),
        "{\"commandKey\":\"automatic-stop\",\"actuatorKind\":\"hbridge\","
        "\"automaticMode\":\"%s\",\"dutyPercent\":%d,\"segmentsCompleted\":%d,"
        "\"durationMs\":%lu,\"endSessionMode\":%d,\"endSessionValue\":%d,"
        "\"interrupted\":%s,\"endReason\":\"%s\"}",
        modeWire,
        dutyPercent_,
        segmentsCompleted_,
        durationMs,
        endSessionModeWire_,
        endSessionValue_,
        interrupted ? "true" : "false",
        endReason != nullptr ? endReason : "");
}

void MotorAutomaticSessionMode::finishSession(
    bool success,
    const char* message,
    const char* endReason,
    bool interrupted) {
    if (!active_) {
        return;
    }

    if (motor_ != nullptr) {
        motor_->stop();
    }

    buildResultJson(endReason, interrupted);
    active_ = false;
    state_ = State::Idle;

    Serial.print(F("[MOTOR-AUTO] complete success="));
    Serial.print(success ? F("true") : F("false"));
    Serial.print(F(" reason="));
    Serial.println(endReason != nullptr ? endReason : "");

    if (stopRequested_ && onComplete_ != nullptr && stopCorrelationId_[0] != '\0') {
        onComplete_(callbackContext_, stopCorrelationId_, success, message, resultJson_);
    }

    if (sessionNotify_ != nullptr && sessionNotifyContext_ != nullptr && resultJson_[0] != '\0') {
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
    segmentNotifyContext_ = nullptr;
    segmentNotify_ = nullptr;
    stopCorrelationId_[0] = '\0';
    segmentsCompleted_ = 0;
    sessionStartMs_ = 0;
    pendingConfigJson_[0] = '\0';
    pendingUpdate_ = false;
}

void MotorAutomaticSessionMode::abort() {
    if (!active_) {
        return;
    }
    finishSession(true, "automatic session aborted", "abort", true);
}

void MotorAutomaticSessionMode::poll() {
    if (!active_) {
        return;
    }

    if (stopRequested_ && state_ != State::SegmentRamp && state_ != State::SetSpeedHold &&
        state_ != State::RampToStop && state_ != State::BurstMicroRamp &&
        state_ != State::BurstHold && state_ != State::BurstGap) {
        finishSession(true, "automatic session stopped", "manualStop", false);
        return;
    }

    if (motor_ != nullptr) {
        motor_->poll();
    }

    if (state_ == State::BurstMicroRamp || state_ == State::BurstHold ||
        state_ == State::BurstGap) {
        pollBurstStates();
        return;
    }

    if (state_ == State::StartDelay) {
        if (millis() < phaseDeadlineMs_) {
            return;
        }
        sessionStartMs_ = millis();
        if (pendingUpdate_) {
            applyPendingUpdate();
        }
        if (!tryContinueProgramAfterGap()) {
            finishSession(false, "automatic session failed", "error", true);
        }
        return;
    }

    if (state_ == State::SetSpeedHold) {
        if (motor_ != nullptr && motor_->isRamping()) {
            if (stopRequested_) {
                requestRampToStop();
            } else if (shouldEndSession()) {
                requestRampToStop();
            }
            return;
        }

        if (stopRequested_) {
            requestRampToStop();
            return;
        }
        if (shouldEndSession()) {
            requestRampToStop();
            return;
        }

        if (burstsOn_ && maybeTriggerWallClockBurst()) {
            return;
        }

        if (pendingUpdate_) {
            applyPendingUpdate();
            beginSetSpeedHold();
        }
        return;
    }

    if (state_ == State::SegmentRamp) {
        if (motor_ != nullptr && motor_->isRamping()) {
            if (stopRequested_) {
                requestRampToStop();
            } else if (shouldEndSession()) {
                requestRampToStop();
            }
            return;
        }

        if (stopRequested_) {
            requestRampToStop();
            return;
        }
        if (shouldEndSession()) {
            requestRampToStop();
            return;
        }

        if (motor_ != nullptr && !motor_->isRamping() && segmentHoldTelemetryPendingMs_ > 0) {
            emitSegmentRamp(
                segmentsCompleted_,
                segmentHoldTelemetrySpeedPercent_,
                segmentHoldTelemetrySpeedPercent_,
                segmentHoldTelemetryPendingMs_);
            segmentHoldTelemetryPendingMs_ = 0;
        }

        if (millis() < segmentHoldDeadlineMs_) {
            return;
        }

        handleCompletedMainSegment();
        return;
    }

    if (state_ == State::RampToStop) {
        if (motor_ != nullptr && motor_->isRamping()) {
            return;
        }
        finishSession(true, stopRequested_ ? "automatic session stopped" : "automatic session complete",
            stopRequested_ ? "manualStop" : "endSession", false);
    }
}

bool MotorAutomaticSessionMode::isActive() const {
    return active_;
}

bool MotorAutomaticSessionMode::loadConfig(MotorAutomaticConfig* outConfig) const {
    if (outConfig == nullptr) {
        return false;
    }
    return parseMotorAutomaticConfig(configJson_, outConfig);
}

unsigned long MotorAutomaticSessionMode::segmentTransitionRampMs(
    const MotorAutomaticConfig& config) const {
    if (config.mode == MotorAutomaticRunMode::PowerWave ||
        config.mode == MotorAutomaticRunMode::BuildUp) {
        return segmentDurationMs_;
    }

    if (config.segmentTargetRampMs < 0) {
        return segmentDurationMs_;
    }

    return static_cast<unsigned long>(config.segmentTargetRampMs);
}

unsigned long MotorAutomaticSessionMode::periodicInitialRampMs(
    const MotorAutomaticConfig& config) const {
    if (config.segmentTargetRampMs < 0) {
        return stopRampMs_ > 0UL ? stopRampMs_ : 1UL;
    }

    return static_cast<unsigned long>(config.segmentTargetRampMs);
}

unsigned long MotorAutomaticSessionMode::burstMicroTransitionRampMs(
    const MotorAutomaticConfig& config) const {
    if (config.segmentTargetRampMs < 0) {
        return stopRampMs_ > 0UL ? stopRampMs_ : 1UL;
    }

    return static_cast<unsigned long>(config.segmentTargetRampMs);
}

void MotorAutomaticSessionMode::rebuildBurstPlan() {
    MotorAutomaticConfig config{};
    if (!loadConfig(&config)) {
        burstPlan_ = AutomaticBurstPlan{};
        return;
    }

    AutomaticConfig planner{};
    motorBurstScheduleInput(config, &planner);

    if (!burstsOn_) {
        burstPlan_ = AutomaticBurstPlan{};
        return;
    }

    if (sessionStartMs_ > 0UL && active_) {
        buildAutomaticBurstPlanForReplan(
            planner, segmentsCompleted_, sessionStartMs_, millis(), &burstPlan_);
    } else {
        buildAutomaticBurstPlan(planner, &burstPlan_);
    }
}

bool MotorAutomaticSessionMode::tryContinueProgramAfterGap() {
    MotorAutomaticConfig config{};
    if (!loadConfig(&config)) {
        return false;
    }

    if (burstsOn_) {
        AutomaticConfig planner{};
        motorBurstScheduleInput(config, &planner);
        if (shouldTriggerBurstBeforeMainStroke(burstPlan_, planner, segmentsCompleted_)) {
            resumeState_ = State::SegmentRamp;
            return beginBurstEvent();
        }
    }

    return beginSegmentTransition();
}

bool MotorAutomaticSessionMode::maybeTriggerWallClockBurst() {
    if (!burstsOn_ || !burstPlan_.active) {
        return false;
    }
    if (burstPlan_.kind != BurstScheduleKind::WallClockDeadlines) {
        return false;
    }
    if (!shouldTriggerBurstInWaitingGap(burstPlan_, sessionStartMs_, millis())) {
        return false;
    }

    resumeState_ = State::SetSpeedHold;
    return beginBurstEvent();
}

bool MotorAutomaticSessionMode::beginBurstEvent() {
    if (motor_ == nullptr || !active_) {
        return false;
    }

    MotorAutomaticConfig config{};
    if (!loadConfig(&config)) {
        return false;
    }

    AutomaticConfig planner{};
    motorBurstScheduleInput(config, &planner);

    burstStrokesTarget_ = drawBurstStrokeCount(planner);
    burstStrokesCompletedInEvent_ = 0;

    Serial.print(F("[MOTOR-AUTO] burst start event="));
    Serial.print(burstEventsCompleted_ + 1);
    Serial.print(F(" micros="));
    Serial.println(burstStrokesTarget_);

    return startNextBurstMicro();
}

bool MotorAutomaticSessionMode::startNextBurstMicro() {
    if (motor_ == nullptr || !active_) {
        return false;
    }

    MotorAutomaticConfig config{};
    if (!loadConfig(&config)) {
        return false;
    }

    AutomaticConfig planner{};
    motorBurstScheduleInput(config, &planner);

    const int burstRelativePower = drawBurstRelativePower(planner);
    const int duty = motorResolveBurstDutyPercent(burstRelativePower, config);
    const int speedPercent = motorDutyPercentToSpeedPercent(duty, config);
    const int fromSpeedPercent = lastCommandedSpeedPercent_;
    const unsigned long transitionMs = burstMicroTransitionRampMs(config);

    burstMicroHoldTelemetryPendingMs_ = 0;

    if (!motor_->beginRampToDuty(duty, transitionMs)) {
        Serial.println(F("[MOTOR-AUTO] reject: motor busy (burst)"));
        return false;
    }

    dutyPercent_ = duty;
    state_ = State::BurstMicroRamp;

    if (transitionMs == 0) {
        emitSegmentRamp(
            segmentsCompleted_,
            speedPercent,
            speedPercent,
            kMotorBurstMicroHoldMs);
    } else {
        emitSegmentRamp(segmentsCompleted_, fromSpeedPercent, speedPercent, transitionMs);
        burstMicroHoldTelemetryPendingMs_ = kMotorBurstMicroHoldMs;
        burstMicroHoldTelemetrySpeedPercent_ = speedPercent;
    }

    Serial.print(F("[MOTOR-AUTO] burst micro "));
    Serial.print(burstStrokesCompletedInEvent_ + 1);
    Serial.print(F("/"));
    Serial.print(burstStrokesTarget_);
    Serial.print(F(" relPower="));
    Serial.print(burstRelativePower);
    Serial.print(F(" programSpeed="));
    Serial.print(fromSpeedPercent);
    Serial.print(F("% burstSpeed="));
    Serial.print(speedPercent);
    Serial.print(F(" burstDuty="));
    Serial.print(duty);
    Serial.print(F("% rampMs="));
    Serial.println(transitionMs);
    return true;
}

void MotorAutomaticSessionMode::finishBurstEvent() {
    burstEventsCompleted_++;
    advanceBurstPlan(&burstPlan_);

    Serial.print(F("[MOTOR-AUTO] burst event complete total="));
    Serial.println(burstEventsCompleted_);

    burstStrokesTarget_ = 0;
    burstStrokesCompletedInEvent_ = 0;

    if (stopRequested_) {
        requestRampToStop();
        return;
    }
    if (shouldEndSession()) {
        requestRampToStop();
        return;
    }

    if (resumeState_ == State::SetSpeedHold) {
        state_ = State::SetSpeedHold;
        return;
    }

    if (pendingUpdate_) {
        applyPendingUpdate();
    }
    if (!tryContinueProgramAfterGap()) {
        finishSession(false, "automatic burst failed to resume", "error", true);
    }
}

void MotorAutomaticSessionMode::handleCompletedMainSegment() {
    if (stopRequested_) {
        requestRampToStop();
        return;
    }
    if (shouldEndSession()) {
        requestRampToStop();
        return;
    }

    segmentsCompleted_++;

    MotorAutomaticConfig config{};
    if (!loadConfig(&config)) {
        finishSession(false, "automatic session failed", "error", true);
        return;
    }

    if (burstsOn_) {
        AutomaticConfig planner{};
        motorBurstScheduleInput(config, &planner);
        if (shouldTriggerBurstAfterMainStroke(burstPlan_, planner, segmentsCompleted_)) {
            resumeState_ = State::SegmentRamp;
            if (!beginBurstEvent()) {
                finishSession(false, "automatic burst failed to start", "error", true);
            }
            return;
        }
    }

    if (pendingUpdate_) {
        applyPendingUpdate();
    }

    if (!tryContinueProgramAfterGap()) {
        finishSession(false, "automatic session failed", "error", true);
    }
}

void MotorAutomaticSessionMode::pollBurstStates() {
    if (stopRequested_) {
        requestRampToStop();
        return;
    }
    if (shouldEndSession()) {
        requestRampToStop();
        return;
    }

    if (state_ == State::BurstMicroRamp) {
        if (motor_ != nullptr && motor_->isRamping()) {
            return;
        }

        if (burstMicroHoldTelemetryPendingMs_ > 0) {
            emitSegmentRamp(
                segmentsCompleted_,
                burstMicroHoldTelemetrySpeedPercent_,
                burstMicroHoldTelemetrySpeedPercent_,
                burstMicroHoldTelemetryPendingMs_);
            burstMicroHoldTelemetryPendingMs_ = 0;
        }

        state_ = State::BurstHold;
        burstPhaseDeadlineMs_ = millis() + kMotorBurstMicroHoldMs;
        return;
    }

    if (state_ == State::BurstHold) {
        if (millis() < burstPhaseDeadlineMs_) {
            return;
        }

        burstStrokesCompletedInEvent_++;
        if (burstStrokesCompletedInEvent_ >= burstStrokesTarget_) {
            finishBurstEvent();
            return;
        }

        MotorAutomaticConfig config{};
        if (!loadConfig(&config)) {
            finishSession(false, "automatic session failed", "error", true);
            return;
        }

        AutomaticConfig planner{};
        motorBurstScheduleInput(config, &planner);
        burstGapSec_ = drawBurstDelaySec(planner);
        if (burstGapSec_ <= 0) {
            if (!startNextBurstMicro()) {
                finishSession(false, "automatic burst failed", "error", true);
            }
            return;
        }

        state_ = State::BurstGap;
        burstPhaseDeadlineMs_ = millis() + static_cast<unsigned long>(burstGapSec_) * 1000UL;
        return;
    }

    if (state_ == State::BurstGap) {
        if (millis() < burstPhaseDeadlineMs_) {
            return;
        }

        if (pendingUpdate_) {
            applyPendingUpdate();
            if (state_ == State::SetSpeedHold || state_ == State::SegmentRamp) {
                return;
            }
        }

        if (!startNextBurstMicro()) {
            finishSession(false, "automatic burst failed", "error", true);
        }
    }
}
