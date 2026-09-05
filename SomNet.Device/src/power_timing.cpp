#include "power_timing.h"

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
