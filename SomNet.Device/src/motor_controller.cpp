#include "motor_controller.h"

#include "boardDefs.h"

#include <Arduino.h>

namespace {

constexpr int kPwmResolutionBits = 10;
constexpr int kPwmMax = (1 << kPwmResolutionBits) - 1;
constexpr int kMotorPwmChannel = 0;

} // namespace

void MotorController::writeEnable(bool energized) {
    const int level = (energized == MOTOR_ENABLE_ACTIVE_HIGH) ? HIGH : LOW;
    digitalWrite(PIN_MOTOR_ENABLE, level);
}

void MotorController::holdSecondaryIdle() {
    digitalWrite(PIN_MOTOR_ENABLE_SECONDARY, MOTOR_ENABLE_ACTIVE_HIGH ? LOW : HIGH);
    digitalWrite(PIN_MOTOR_PWM_SECONDARY, LOW);
}

void MotorController::writePwmDuty(int dutyPercent) {
    if (dutyPercent <= 0) {
        ledcWrite(kMotorPwmChannel, 0);
        return;
    }

    if (dutyPercent > 100) {
        dutyPercent = 100;
    }

    const int duty = (dutyPercent * kPwmMax) / 100;
    ledcWrite(kMotorPwmChannel, duty);
}

void MotorController::begin() {
    pinMode(PIN_MOTOR_ENABLE, OUTPUT);
    pinMode(PIN_MOTOR_ENABLE_SECONDARY, OUTPUT);
    pinMode(PIN_MOTOR_PWM_SECONDARY, OUTPUT);

    ledcSetup(kMotorPwmChannel, MOTOR_PWM_FREQUENCY_HZ, kPwmResolutionBits);
    ledcAttachPin(PIN_MOTOR_PWM, kMotorPwmChannel);

    holdSecondaryIdle();
    writeEnable(false);
    writePwmDuty(0);
    dutyPercent_ = 0;
    initialized_ = true;
    Serial.println(F("[MOTOR] backend ready (pins idle)"));
}

void MotorController::poll() {
    if (!initialized_ || !ramping_) {
        return;
    }

    const unsigned long now = millis();
    if (rampDurationMs_ == 0) {
        ramping_ = false;
        setDutyPercent(rampToPercent_);
        return;
    }

    const unsigned long elapsed = now - rampStartMs_;
    if (elapsed >= rampDurationMs_) {
        ramping_ = false;
        if (rampToPercent_ <= 0) {
            stop();
        } else {
            setDutyPercent(rampToPercent_);
        }
        return;
    }

    const float t = static_cast<float>(elapsed) / static_cast<float>(rampDurationMs_);
    const int duty = rampFromPercent_ + static_cast<int>((rampToPercent_ - rampFromPercent_) * t);
    holdSecondaryIdle();
    writePwmDuty(duty);
    writeEnable(duty > 0);
    dutyPercent_ = duty;
}

bool MotorController::beginRampToDuty(int targetPercent, unsigned long rampMs) {
    if (!initialized_) {
        return false;
    }

    if (targetPercent < 0) {
        targetPercent = 0;
    }
    if (targetPercent > 100) {
        targetPercent = 100;
    }

    if (rampMs == 0) {
        return setDutyPercent(targetPercent);
    }

    ramping_ = true;
    rampFromPercent_ = dutyPercent_;
    rampToPercent_ = targetPercent;
    rampStartMs_ = millis();
    rampDurationMs_ = rampMs;

    Serial.print(F("[MOTOR] ramp "));
    Serial.print(rampFromPercent_);
    Serial.print(F("% -> "));
    Serial.print(rampToPercent_);
    Serial.print(F("% in "));
    Serial.print(rampMs);
    Serial.println(F(" ms"));
    return true;
}

bool MotorController::setDutyPercent(int dutyPercent) {
    if (!initialized_) {
        return false;
    }

    ramping_ = false;

    if (dutyPercent < 0) {
        dutyPercent = 0;
    }
    if (dutyPercent > 100) {
        dutyPercent = 100;
    }

    if (dutyPercent == 0) {
        stop();
        return true;
    }

    holdSecondaryIdle();
    writePwmDuty(dutyPercent);
    writeEnable(true);
    dutyPercent_ = dutyPercent;

    Serial.print(F("[MOTOR] duty="));
    Serial.println(dutyPercent);
    return true;
}

void MotorController::stop() {
    if (!initialized_) {
        return;
    }

    ramping_ = false;
    writePwmDuty(0);
    writeEnable(false);
    holdSecondaryIdle();
    if (dutyPercent_ != 0) {
        Serial.println(F("[MOTOR] stop"));
    }
    dutyPercent_ = 0;
}

bool MotorController::isActive() const {
    return initialized_ && (dutyPercent_ > 0 || ramping_);
}

bool MotorController::isRamping() const {
    return initialized_ && ramping_;
}
