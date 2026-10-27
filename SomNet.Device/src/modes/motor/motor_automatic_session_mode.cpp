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

    rampMs_ = static_cast<unsigned long>(config.rampMs);
    endSessionValue_ = config.endSessionValue;
    endSessionModeWire_ = motorEndSessionModeToWire(config.endSessionMode);
    segmentsCompleted_ = 0;
    dutyPercent_ = motorSpeedPercentToDuty(
        motorResolveSpeedPercentForSegment(config, segmentsCompleted_, sessionStartMs_, millis()),
        config);
    stopRequested_ = false;
    stopCorrelationId_[0] = '\0';
    callbackContext_ = nullptr;
    onComplete_ = nullptr;
    resultJson_[0] = '\0';
    sessionStartMs_ = 0;
    phaseDeadlineMs_ = 0;
    delayStartMs_ = millis();
    active_ = true;

    Serial.print(F("[MOTOR-AUTO] start periodic duty="));
    Serial.print(dutyPercent_);
    Serial.print(F("% delaySec="));
    Serial.println(config.delayBeforeStartSeconds);

    if (config.delayBeforeStartSeconds > 0) {
        state_ = State::StartDelay;
        phaseDeadlineMs_ = delayStartMs_ + static_cast<unsigned long>(config.delayBeforeStartSeconds) * 1000UL;
    } else {
        sessionStartMs_ = millis();
        if (!beginRunSegment()) {
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
    rampMs_ = static_cast<unsigned long>(config.rampMs);
    endSessionValue_ = config.endSessionValue;
    endSessionModeWire_ = motorEndSessionModeToWire(config.endSessionMode);
    dutyPercent_ = motorSpeedPercentToDuty(
        motorResolveSpeedPercentForSegment(config, segmentsCompleted_, sessionStartMs_, millis()),
        config);
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

bool MotorAutomaticSessionMode::beginRunSegment() {
    if (motor_ == nullptr || !active_) {
        return false;
    }

    MotorAutomaticConfig config{};
    if (!parseMotorAutomaticConfig(configJson_, &config)) {
        return false;
    }

    runSeconds_ = pickSegmentSeconds();
    gapSeconds_ = pickSegmentSeconds();
    dutyPercent_ = motorSpeedPercentToDuty(
        motorResolveSpeedPercentForSegment(config, segmentsCompleted_, sessionStartMs_, millis()),
        config);

    if (!motor_->beginRampToDuty(dutyPercent_, rampMs_)) {
        Serial.println(F("[MOTOR-AUTO] reject: motor busy"));
        return false;
    }

    state_ = State::RampUp;
    phaseDeadlineMs_ = 0;

    Serial.print(F("[MOTOR-AUTO] run duty="));
    Serial.print(dutyPercent_);
    Serial.print(F("% rampMs="));
    Serial.print(rampMs_);
    Serial.print(F(" runSec="));
    Serial.println(runSeconds_);
    return true;
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

    if (stopRequested_ && state_ != State::Running && state_ != State::RampUp && state_ != State::RampDown) {
        finishSession(true, "automatic session stopped", "manualStop", false);
        return;
    }

    if (shouldEndSession()) {
        finishSession(true, "automatic session complete", "endSession", false);
        return;
    }

    const unsigned long now = millis();

    if (motor_ != nullptr) {
        motor_->poll();
    }

    if (state_ == State::StartDelay) {
        if (now < phaseDeadlineMs_) {
            return;
        }
        sessionStartMs_ = now;
        if (pendingUpdate_) {
            applyPendingUpdate();
        }
        if (!beginRunSegment()) {
            finishSession(false, "automatic session failed", "error", true);
        }
        return;
    }

    if (state_ == State::RampUp) {
        if (motor_ == nullptr || motor_->isRamping()) {
            return;
        }
        if (stopRequested_) {
            finishSession(true, "automatic session stopped", "manualStop", false);
            return;
        }
        state_ = State::Running;
        phaseDeadlineMs_ = now + static_cast<unsigned long>(runSeconds_) * 1000UL;
        return;
    }

    if (state_ == State::Running) {
        if (stopRequested_) {
            if (motor_ != nullptr) {
                motor_->beginRampToDuty(0, rampMs_);
            }
            state_ = State::RampDown;
            return;
        }
        if (now < phaseDeadlineMs_) {
            return;
        }
        if (motor_ != nullptr) {
            motor_->beginRampToDuty(0, rampMs_);
        }
        state_ = State::RampDown;
        return;
    }

    if (state_ == State::RampDown) {
        if (motor_ != nullptr && motor_->isRamping()) {
            return;
        }
        segmentsCompleted_++;
        if (stopRequested_) {
            finishSession(true, "automatic session stopped", "manualStop", false);
            return;
        }
        if (shouldEndSession()) {
            finishSession(true, "automatic session complete", "endSession", false);
            return;
        }
        state_ = State::Gap;
        phaseDeadlineMs_ = now + static_cast<unsigned long>(gapSeconds_) * 1000UL;
        Serial.print(F("[MOTOR-AUTO] gap sec="));
        Serial.println(gapSeconds_);
        return;
    }

    if (state_ == State::Gap) {
        if (now < phaseDeadlineMs_) {
            return;
        }
        if (pendingUpdate_) {
            applyPendingUpdate();
        }
        if (!beginRunSegment()) {
            finishSession(false, "automatic session failed", "error", true);
        }
    }
}

bool MotorAutomaticSessionMode::isActive() const {
    return active_;
}
