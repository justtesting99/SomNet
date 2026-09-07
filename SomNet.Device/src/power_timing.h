#pragma once

int strokeMsFromPower(int powerPercent, int minimumStrokeMs, int maximumStrokeMs);

/** Triangle phase in [0,1): 0→min, 0.5→max, 1→min (piecewise linear). */
float sampleTriangle01(float phase01);

/** Linear ramp in [0,1]: 0→0, 1→1 (build-up half-wave). */
float sampleHalfWave01(float phase01);

int lerpInt(int from, int to, float t);

/** Power percent from triangle sample between min and max. */
int sampleTrianglePowerPercent(int minimumPower, int maximumPower, float phase01);

/** Gap seconds from inverse triangle (max gap at min power phase). */
int sampleInverseTriangleGapSec(int strokeMinSeconds, int strokeMaxSeconds, float phase01);

/** Half-wave ramp: power min→max, gap max→min over t in [0,1]. */
void sampleBuildUpRow(
    int minimumPower,
    int maximumPower,
    int strokeMinSeconds,
    int strokeMaxSeconds,
    float t,
    int& powerPercent,
    int& gapSec);

