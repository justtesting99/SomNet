#include "modes/automatic/programs/random_program.h"

#include <esp_system.h>

namespace {

int randomInclusive(int lo, int hi) {
    if (lo > hi) {
        const int tmp = lo;
        lo = hi;
        hi = tmp;
    }

    if (lo == hi) {
        return lo;
    }

    const uint32_t span = static_cast<uint32_t>(hi - lo + 1);
    return lo + static_cast<int>(esp_random() % span);
}

} // namespace

RandomProgram::RandomProgram(AutomaticRunMode mode) : mode_(mode) {}

void RandomProgram::getStrokeParameters(
    int /*strokeIndex*/,
    const AutomaticConfig& config,
    int& powerPercent,
    int& gapSec) const {
    switch (mode_) {
        case AutomaticRunMode::RandomPowerOnly:
            powerPercent = randomInclusive(config.minimumPower, config.maximumPower);
            gapSec = config.strokeMaxSeconds;
            break;

        case AutomaticRunMode::RandomTimingOnly:
            powerPercent = config.maximumPower;
            gapSec = randomInclusive(config.strokeMinSeconds, config.strokeMaxSeconds);
            break;

        case AutomaticRunMode::RandomPowerAndTiming:
            powerPercent = randomInclusive(config.minimumPower, config.maximumPower);
            gapSec = randomInclusive(config.strokeMinSeconds, config.strokeMaxSeconds);
            break;

        default:
            powerPercent = config.maximumPower;
            gapSec = config.strokeMaxSeconds;
            break;
    }
}
