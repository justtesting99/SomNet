#pragma once

#include <stddef.h>

enum class AutomaticRunMode {
    Unknown,
    Periodic,
    RandomPowerOnly,
    RandomTimingOnly,
    RandomPowerAndTiming,
    PowerWave,
    PowerAndTimingWave,
    BuildUp,
};

enum class EndSessionMode {
    Unknown,
    Minutes,
    Strokes,
    NoAutoEnd,
};

enum class BurstStyle {
    Unknown,
    FixedPowerDelay,
    RandomPowerOnly,
    RandomDelayOnly,
    RandomPowerAndDelay,
};

struct AutomaticConfig {
    AutomaticRunMode mode = AutomaticRunMode::Unknown;
    int minimumStrokeMs = 25;
    int maximumStrokeMs = 400;
    int minimumPower = 0;
    int maximumPower = 100;
    int strokeMinSeconds = 0;
    int strokeMaxSeconds = 0;
    int delayBeforeStartSeconds = 0;
    int endSessionValue = 0;
    EndSessionMode endSessionMode = EndSessionMode::NoAutoEnd;
    bool burstsOn = false;
    int burstPercent = 0;
    BurstStyle burstStyle = BurstStyle::FixedPowerDelay;
    int burstStrokePowerMin = 0;
    int burstStrokePowerMax = 100;
    int burstDelayMin = 0;
    int burstDelayMax = 0;
    int burstStrokesMin = 1;
    int burstStrokesMax = 1;
    bool valid = false;
};

AutomaticRunMode parseAutomaticRunMode(const char* value);
EndSessionMode parseEndSessionMode(const char* value);
BurstStyle parseBurstStyle(const char* value);

/** Parse automatic-start payload (camelCase, P9P2-D4). */
bool parseAutomaticConfig(const char* payloadJson, AutomaticConfig* outConfig);

int clampPowerPercent(int value);
void normalizePowerRange(int* minimumPower, int* maximumPower);

/** Effective values after UI disable rules (§3, P9P2-D5–D7). */
int effectivePowerPercentForMode(const AutomaticConfig& config);
int effectiveGapSecondsForMode(const AutomaticConfig& config);

bool isAutomaticStartKey(const char* commandKey);
bool isAutomaticStopKey(const char* commandKey);

/** Hub correlationId when automatic session ends without automatic-stop (P9-D4 end-rule / abort). */
constexpr const char* kAutomaticSessionCompleteCorrelationId = "automatic-session-complete";
