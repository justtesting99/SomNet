#pragma once

#include <stdint.h>

/** BTS7960 primary channel — PWM on D25, enable on D27 (v1). Doc 31 / boardDefs.h */
class MotorController {
public:
    void begin();
    void poll();

    /** 0–100 duty; 0 stops motor (PWM off, enable inactive). */
    bool setDutyPercent(int dutyPercent);
    /** Linear ramp from current duty (or 0 if stopped) to target over rampMs. */
    bool beginRampToDuty(int targetPercent, unsigned long rampMs);
    void stop();

    bool isActive() const;
    bool isRamping() const;

private:
    void writeEnable(bool energized);
    void writePwmDuty(int dutyPercent);
    void holdSecondaryIdle();

    int dutyPercent_ = 0;
    bool ramping_ = false;
    int rampFromPercent_ = 0;
    int rampToPercent_ = 0;
    unsigned long rampStartMs_ = 0;
    unsigned long rampDurationMs_ = 0;
    bool initialized_ = false;
};
