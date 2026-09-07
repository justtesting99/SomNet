#include "modes/automatic/programs/periodic_program.h"

#include "modes/automatic/automatic_config.h"

void PeriodicProgram::getStrokeParameters(
    int /*strokeIndex*/,
    const AutomaticConfig& config,
    int& powerPercent,
    int& gapSec) const {
    powerPercent = effectivePowerPercentForMode(config);
    gapSec = effectiveGapSecondsForMode(config);
}
