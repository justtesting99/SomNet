#include "modes/automatic/automatic_plan.h"

#include "power_timing.h"

#include <Arduino.h>
#include <math.h>
#include <new>

namespace {

constexpr unsigned long kSecondsPerMinute = 60UL;

bool requiresScheduledEndSession(AutomaticRunMode mode) {
    return mode == AutomaticRunMode::PowerWave || mode == AutomaticRunMode::PowerAndTimingWave ||
        mode == AutomaticRunMode::BuildUp;
}

size_t capScheduleCount(size_t count) {
    return count > kMaxAutomaticScheduleRows ? kMaxAutomaticScheduleRows : count;
}

int averageGapSeconds(int strokeMinSeconds, int strokeMaxSeconds) {
    return (strokeMinSeconds + strokeMaxSeconds) / 2;
}

size_t estimateStrokeCountForMinutes(int endSessionMinutes, int gapSec) {
    if (endSessionMinutes <= 0 || gapSec <= 0) {
        return 0;
    }

    const unsigned long sessionSec = static_cast<unsigned long>(endSessionMinutes) * kSecondsPerMinute;
    return capScheduleCount(sessionSec / static_cast<unsigned long>(gapSec) + 1UL);
}

size_t resolveScheduleStrokeCount(const AutomaticConfig& config, int nominalGapSec) {
    if (config.endSessionMode == EndSessionMode::Strokes) {
        if (config.endSessionValue <= 0) {
            return 0;
        }
        return capScheduleCount(static_cast<size_t>(config.endSessionValue));
    }

    if (config.endSessionMode == EndSessionMode::Minutes) {
        return estimateStrokeCountForMinutes(config.endSessionValue, nominalGapSec);
    }

    return 0;
}

unsigned long deriveTWaveSeconds(const AutomaticConfig& config, int fixedGapSec, size_t strokeCount) {
    if (config.endSessionMode == EndSessionMode::Minutes && config.endSessionValue > 0) {
        const unsigned long tRiseSec = static_cast<unsigned long>(config.endSessionValue) * kSecondsPerMinute;
        return tRiseSec * 2UL;
    }

    if (strokeCount == 0 || fixedGapSec <= 0) {
        return 1UL;
    }

    const unsigned long tRiseSec = (static_cast<unsigned long>(strokeCount) * static_cast<unsigned long>(fixedGapSec)) / 2UL;
    return tRiseSec > 0 ? tRiseSec * 2UL : 2UL;
}

float phaseFromElapsed(unsigned long elapsedSec, unsigned long tWaveSec) {
    if (tWaveSec == 0) {
        return 0.0f;
    }

    const float period = static_cast<float>(tWaveSec);
    const float elapsed = static_cast<float>(elapsedSec);
    return elapsed / period;
}

float wrapUnitPhase(float phase) {
    float wrapped = phase;
    while (wrapped >= 1.0f) {
        wrapped -= 1.0f;
    }
    while (wrapped < 0.0f) {
        wrapped += 1.0f;
    }
    return wrapped;
}

bool buildPowerWaveSchedule(
    const AutomaticConfig& config,
    StrokeScheduleRow** outRows,
    size_t* outCount,
    float phaseOffsetNorm) {
    const int fixedGap = config.strokeMaxSeconds;
    if (fixedGap <= 0) {
        Serial.println(F("[AUTO] reject: strokeMaxSeconds required for powerWave"));
        return false;
    }

    const size_t count = resolveScheduleStrokeCount(config, fixedGap);
    if (count == 0) {
        Serial.println(F("[AUTO] reject: end session required for powerWave"));
        return false;
    }

    auto* rows = new (std::nothrow) StrokeScheduleRow[count];
    if (rows == nullptr) {
        Serial.println(F("[AUTO] reject: schedule allocation failed"));
        return false;
    }

    const unsigned long tWaveSec = deriveTWaveSeconds(config, fixedGap, count);

    for (size_t i = 0; i < count; ++i) {
        const unsigned long elapsedSec = static_cast<unsigned long>(i) * static_cast<unsigned long>(fixedGap);
        const float phase = wrapUnitPhase(phaseFromElapsed(elapsedSec, tWaveSec) + phaseOffsetNorm);
        rows[i].powerPercent =
            sampleTrianglePowerPercent(config.minimumPower, config.maximumPower, phase);
        rows[i].gapSec = fixedGap;
    }

    *outRows = rows;
    *outCount = count;
    return true;
}

bool buildPowerAndTimingWaveSchedule(
    const AutomaticConfig& config,
    StrokeScheduleRow** outRows,
    size_t* outCount,
    float phaseOffsetNorm) {
    const int avgGap = averageGapSeconds(config.strokeMinSeconds, config.strokeMaxSeconds);
    if (config.strokeMinSeconds <= 0 || config.strokeMaxSeconds <= 0) {
        Serial.println(F("[AUTO] reject: strokeMin/MaxSeconds required for powerAndTimingWave"));
        return false;
    }

    const size_t count = resolveScheduleStrokeCount(config, avgGap > 0 ? avgGap : config.strokeMaxSeconds);
    if (count == 0) {
        Serial.println(F("[AUTO] reject: end session required for powerAndTimingWave"));
        return false;
    }

    auto* rows = new (std::nothrow) StrokeScheduleRow[count];
    if (rows == nullptr) {
        Serial.println(F("[AUTO] reject: schedule allocation failed"));
        return false;
    }

    const unsigned long tWaveSec =
        deriveTWaveSeconds(config, config.strokeMaxSeconds, count);
    unsigned long elapsedSec = 0;

    for (size_t i = 0; i < count; ++i) {
        const float phase = wrapUnitPhase(phaseFromElapsed(elapsedSec, tWaveSec) + phaseOffsetNorm);
        rows[i].powerPercent =
            sampleTrianglePowerPercent(config.minimumPower, config.maximumPower, phase);
        rows[i].gapSec = sampleInverseTriangleGapSec(
            config.strokeMinSeconds,
            config.strokeMaxSeconds,
            phase);
        if (rows[i].gapSec < 0) {
            rows[i].gapSec = 0;
        }
        elapsedSec += static_cast<unsigned long>(rows[i].gapSec);
    }

    *outRows = rows;
    *outCount = count;
    return true;
}

bool buildBuildUpSchedule(
    const AutomaticConfig& config,
    StrokeScheduleRow** outRows,
    size_t* outCount,
    float phaseOffsetNorm) {
    const int avgGap = averageGapSeconds(config.strokeMinSeconds, config.strokeMaxSeconds);
    if (config.strokeMinSeconds <= 0 || config.strokeMaxSeconds <= 0) {
        Serial.println(F("[AUTO] reject: strokeMin/MaxSeconds required for buildUp"));
        return false;
    }

    const size_t count = resolveScheduleStrokeCount(config, avgGap > 0 ? avgGap : config.strokeMaxSeconds);
    if (count == 0) {
        Serial.println(F("[AUTO] reject: end session required for buildUp"));
        return false;
    }

    auto* rows = new (std::nothrow) StrokeScheduleRow[count];
    if (rows == nullptr) {
        Serial.println(F("[AUTO] reject: schedule allocation failed"));
        return false;
    }

    for (size_t i = 0; i < count; ++i) {
        const float rowPhase = count > 1 ? static_cast<float>(i) / static_cast<float>(count - 1) : 0.0f;
        const float t = rowPhase + phaseOffsetNorm > 1.0f ? 1.0f : rowPhase + phaseOffsetNorm;
        sampleBuildUpRow(
            config.minimumPower,
            config.maximumPower,
            config.strokeMinSeconds,
            config.strokeMaxSeconds,
            t,
            rows[i].powerPercent,
            rows[i].gapSec);
    }

    *outRows = rows;
    *outCount = count;

    Serial.print(F("[AUTO] buildUp schedule rows="));
    Serial.println(static_cast<unsigned>(count));

    return true;
}

} // namespace

void freeStrokeSchedule(StrokeScheduleRow* rows) {
    delete[] rows;
}

bool buildStrokeSchedule(
    const AutomaticConfig& config,
    StrokeScheduleRow** outRows,
    size_t* outCount,
    float phaseOffsetNorm) {
    if (outRows == nullptr || outCount == nullptr || !config.valid) {
        return false;
    }

    *outRows = nullptr;
    *outCount = 0;

    if (!requiresScheduledEndSession(config.mode)) {
        return false;
    }

    if (config.endSessionMode == EndSessionMode::NoAutoEnd || config.endSessionValue <= 0) {
        Serial.println(F("[AUTO] reject: wave/buildUp requires end session"));
        return false;
    }

    switch (config.mode) {
        case AutomaticRunMode::PowerWave:
            return buildPowerWaveSchedule(config, outRows, outCount, phaseOffsetNorm);
        case AutomaticRunMode::PowerAndTimingWave:
            return buildPowerAndTimingWaveSchedule(config, outRows, outCount, phaseOffsetNorm);
        case AutomaticRunMode::BuildUp:
            return buildBuildUpSchedule(config, outRows, outCount, phaseOffsetNorm);
        default:
            return false;
    }
}
