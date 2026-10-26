#pragma once

#include <stddef.h>
#include <stdint.h>

enum class MotorEndSessionMode : uint8_t {
    NoAutoEnd = 0,
    Minutes = 1,
};

struct MotorAutomaticConfig {
    bool valid = false;
    int minimumDutyPercent = 0;
    int maximumDutyPercent = 80;
    int segmentMinSeconds = 5;
    int segmentMaxSeconds = 20;
    int delayBeforeStartSeconds = 0;
    MotorEndSessionMode endSessionMode = MotorEndSessionMode::NoAutoEnd;
    int endSessionValue = 0;
    int rampMs = 500;
};

bool parseMotorAutomaticConfig(const char* payloadJson, MotorAutomaticConfig* outConfig);

int motorEndSessionModeToWire(MotorEndSessionMode mode);
