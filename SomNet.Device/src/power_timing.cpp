#include "power_timing.h"

#include <math.h>

namespace {

float clampUnitFloat(float value) {
    if (value < 0.0f) {
        return 0.0f;
    }
    if (value > 1.0f) {
        return 1.0f;
    }
    return value;
}

} // namespace

int strokeMsFromPower(int powerPercent, int minimumStrokeMs, int maximumStrokeMs) {
    if (minimumStrokeMs > maximumStrokeMs) {
        return minimumStrokeMs;
    }
    if (powerPercent < 0) {
        powerPercent = 0;
    }
    if (powerPercent > 100) {
        powerPercent = 100;
    }
    const int range = maximumStrokeMs - minimumStrokeMs;
    return minimumStrokeMs + (range * powerPercent) / 100;
}

float sampleTriangle01(float phase01) {
    float phase = phase01 - floorf(phase01);
    if (phase < 0.0f) {
        phase += 1.0f;
    }

    if (phase < 0.5f) {
        return phase * 2.0f;
    }

    return 2.0f - phase * 2.0f;
}

float sampleHalfWave01(float phase01) {
    return clampUnitFloat(phase01);
}

int lerpInt(int from, int to, float t) {
    const float clamped = clampUnitFloat(t);
    return from + static_cast<int>((to - from) * clamped + (from <= to ? 0.5f : -0.5f));
}

int sampleTrianglePowerPercent(int minimumPower, int maximumPower, float phase01) {
    return lerpInt(minimumPower, maximumPower, sampleTriangle01(phase01));
}

int sampleInverseTriangleGapSec(int strokeMinSeconds, int strokeMaxSeconds, float phase01) {
    const float inverse = 1.0f - sampleTriangle01(phase01);
    return lerpInt(strokeMinSeconds, strokeMaxSeconds, inverse);
}

void sampleBuildUpRow(
    int minimumPower,
    int maximumPower,
    int strokeMinSeconds,
    int strokeMaxSeconds,
    float t,
    int& powerPercent,
    int& gapSec) {
    const float phase = sampleHalfWave01(t);
    powerPercent = lerpInt(minimumPower, maximumPower, phase);
    gapSec = lerpInt(strokeMaxSeconds, strokeMinSeconds, phase);
}
