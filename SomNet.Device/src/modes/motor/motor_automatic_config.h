#pragma once

#include <stddef.h>
#include <stdint.h>

enum class MotorEndSessionMode : uint8_t {
    NoAutoEnd = 0,
    Minutes = 1,
};

enum class MotorAutomaticRunMode : uint8_t {
    Unknown = 0,
    Periodic,
    RandomSpeed,
    RandomSpeedAndTiming,
    PowerWave,
    BuildUp,
};

struct MotorAutomaticConfig {
    bool valid = false;
    MotorAutomaticRunMode mode = MotorAutomaticRunMode::Periodic;
    int minimumDutyPercent = 0;
    int maximumDutyPercent = 80;
    int minimumSpeedPercent = 0;
    int maximumSpeedPercent = 100;
    int segmentMinSeconds = 5;
    int segmentMaxSeconds = 20;
    int delayBeforeStartSeconds = 0;
    MotorEndSessionMode endSessionMode = MotorEndSessionMode::NoAutoEnd;
    int endSessionValue = 0;
    int rampMs = 500;
};

bool parseMotorAutomaticConfig(const char* payloadJson, MotorAutomaticConfig* outConfig);

int motorEndSessionModeToWire(MotorEndSessionMode mode);

MotorAutomaticRunMode parseMotorAutomaticRunMode(const char* value);

/** Map 0–100 speed to duty using configured duty limits. */
int motorSpeedPercentToDuty(int speedPercent, const MotorAutomaticConfig& config);

/** Target speed (0–100) for a segment boundary — mode graph sample point. */
int motorResolveSpeedPercentForSegment(
    const MotorAutomaticConfig& config,
    int segmentIndex,
    unsigned long sessionStartMs,
    unsigned long nowMs);

/** Hub correlationId for live segment telemetry (commanded speed ramps). */
constexpr const char* kMotorAutomaticSegmentCorrelationId = "motor-automatic-segment";
