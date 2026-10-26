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
    // Steady-state PWM — no pulse FSM in M0.
}

bool MotorController::setDutyPercent(int dutyPercent) {
    if (!initialized_) {
        return false;
    }

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

    writePwmDuty(0);
    writeEnable(false);
    holdSecondaryIdle();
    if (dutyPercent_ != 0) {
        Serial.println(F("[MOTOR] stop"));
    }
    dutyPercent_ = 0;
}

bool MotorController::isActive() const {
    return initialized_ && dutyPercent_ > 0;
}
