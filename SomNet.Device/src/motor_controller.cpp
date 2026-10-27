#include "motor_controller.h"

#include "boardDefs.h"

#include <Arduino.h>

namespace {

constexpr int kPwmResolutionBits = 10;
constexpr int kPwmMax = (1 << kPwmResolutionBits) - 1;
constexpr int kMotorPwmChannelPrimary = 0;
constexpr int kMotorPwmChannelSecondary = 1;

} // namespace

void MotorController::writePrimaryEnable(bool energized) {
    const int level = (energized == MOTOR_ENABLE_ACTIVE_HIGH) ? HIGH : LOW;
    digitalWrite(PIN_MOTOR_ENABLE, level);
}

void MotorController::writeSecondaryEnable(bool energized) {
    if (MOTOR_ENABLES_GANGED_ON_D27) {
        return;
    }

    const int level = (energized == MOTOR_ENABLE_ACTIVE_HIGH) ? HIGH : LOW;
    digitalWrite(PIN_MOTOR_ENABLE_SECONDARY, level);
}

void MotorController::writeRunEnable(bool energized) {
    if (MOTOR_ENABLES_GANGED_ON_D27) {
        writePrimaryEnable(energized);
        return;
    }

    if (MOTOR_FORWARD_PWM_ON_D26) {
        writePrimaryEnable(false);
        writeSecondaryEnable(energized);
    } else {
        writeSecondaryEnable(false);
        writePrimaryEnable(energized);
    }
}

void MotorController::holdAllPwmIdle() {
    ledcWrite(kMotorPwmChannelPrimary, 0);
    ledcWrite(kMotorPwmChannelSecondary, 0);
}

void MotorController::holdIdle() {
    holdAllPwmIdle();
    writeRunEnable(false);
}

void MotorController::writeForwardPwmDuty(int dutyPercent) {
    if (dutyPercent <= 0) {
        holdIdle();
        return;
    }

    if (dutyPercent > 100) {
        dutyPercent = 100;
    }

    const int duty = (dutyPercent * kPwmMax) / 100;

    if (MOTOR_FORWARD_PWM_ON_D26) {
        ledcWrite(kMotorPwmChannelPrimary, 0);
        ledcWrite(kMotorPwmChannelSecondary, duty);
    } else {
        ledcWrite(kMotorPwmChannelSecondary, 0);
        ledcWrite(kMotorPwmChannelPrimary, duty);
    }

    writeRunEnable(true);
}

void MotorController::beginIfNeeded() {
    if (initialized_) {
        return;
    }
    begin();
}

void MotorController::begin() {
    if (initialized_) {
        return;
    }

    pinMode(PIN_MOTOR_ENABLE, OUTPUT);
    if (!MOTOR_ENABLES_GANGED_ON_D27) {
        pinMode(PIN_MOTOR_ENABLE_SECONDARY, OUTPUT);
    }

    ledcSetup(kMotorPwmChannelPrimary, MOTOR_PWM_FREQUENCY_HZ, kPwmResolutionBits);
    ledcAttachPin(PIN_MOTOR_PWM, kMotorPwmChannelPrimary);
    ledcSetup(kMotorPwmChannelSecondary, MOTOR_PWM_FREQUENCY_HZ, kPwmResolutionBits);
    ledcAttachPin(PIN_MOTOR_PWM_SECONDARY, kMotorPwmChannelSecondary);

    holdIdle();
    dutyPercent_ = 0;
    initialized_ = true;
    Serial.print(F("[MOTOR] ready forward=PWM D"));
    Serial.print(MOTOR_FORWARD_PWM_ON_D26 ? PIN_MOTOR_PWM_SECONDARY : PIN_MOTOR_PWM);
    Serial.print(F(" enable="));
    Serial.println(MOTOR_ENABLES_GANGED_ON_D27 ? F("D27 ganged") : F("split R/L EN"));
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
    writeForwardPwmDuty(duty);
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

    writeForwardPwmDuty(dutyPercent);
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
    holdIdle();
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
