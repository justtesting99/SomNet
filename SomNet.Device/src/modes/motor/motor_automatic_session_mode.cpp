#include "modes/motor/motor_automatic_session_mode.h"

#include "modes/automatic/automatic_config.h"
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
    segmentsCompleted_ = 0;
    dutyPercent_ = 0;
    stopRequested_ = false;
    stopCorrelationId_[0] = '\0';
    callbackContext_ = nullptr;
    onComplete_ = nullptr;
    resultJson_[0] = '\0';
    sessionStartMs_ = 0;
    phaseDeadlineMs_ = 0;
    delayStartMs_ = millis();
    active_ = true;

    Serial.print(F("[MOTOR-AUTO] start continuous delaySec="));
    Serial.println(config.delayBeforeStartSeconds);

    if (config.delayBeforeStartSeconds > 0) {
        state_ = State::StartDelay;
        phaseDeadlineMs_ = delayStartMs_ + static_cast<unsigned long>(config.delayBeforeStartSeconds) * 1000UL;
    } else {
        sessionStartMs_ = millis();
        if (!beginSegmentTransition()) {
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
    const unsigned long rampMs = stopRampMs_ > 0UL ? stopRampMs_ : 1UL;

    if (!motor_->beginRampToDuty(dutyPercent_, rampMs)) {
        Serial.println(F("[MOTOR-AUTO] reject: motor busy"));
        return false;
    }

    state_ = State::SetSpeedHold;
    segmentsCompleted_ = 1;

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

    if (!motor_->beginRampToDuty(toDuty, segmentDurationMs_)) {
        Serial.println(F("[MOTOR-AUTO] reject: motor busy"));
        return false;
    }

    state_ = State::SegmentRamp;

    Serial.print(F("[MOTOR-AUTO] segment #"));
    Serial.print(segmentsCompleted_);
    Serial.print(F(" duty "));
    Serial.print(fromDuty);
    Serial.print(F("% -> "));
    Serial.print(toDuty);
    Serial.print(F("% over "));
    Serial.print(segmentDurationMs_ / 1000UL);
    Serial.println(F("s"));
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

    snprintf(
        resultJson_,
        sizeof(resultJson_),
        "{\"commandKey\":\"automatic-stop\",\"actuatorKind\":\"hbridge\","
        "\"automaticMode\":\"periodic\",\"dutyPercent\":%d,\"segmentsCompleted\":%d,"
        "\"durationMs\":%lu,\"endSessionMode\":%d,\"endSessionValue\":%d,"
        "\"interrupted\":%s,\"endReason\":\"%s\"}",
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
        state_ != State::RampToStop) {
        finishSession(true, "automatic session stopped", "manualStop", false);
        return;
    }

    if (motor_ != nullptr) {
        motor_->poll();
    }

    if (state_ == State::StartDelay) {
        if (millis() < phaseDeadlineMs_) {
            return;
        }
        sessionStartMs_ = millis();
        if (pendingUpdate_) {
            applyPendingUpdate();
        }
        if (!beginSegmentTransition()) {
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

        segmentsCompleted_++;
        if (pendingUpdate_) {
            applyPendingUpdate();
        }
        if (!beginSegmentTransition()) {
            finishSession(false, "automatic session failed", "error", true);
        }
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
