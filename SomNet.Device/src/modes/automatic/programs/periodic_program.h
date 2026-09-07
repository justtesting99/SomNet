#pragma once

#include "modes/automatic/automatic_program_base.h"

class PeriodicProgram : public AutomaticProgramBase {
public:
    void getStrokeParameters(
        int strokeIndex,
        const AutomaticConfig& config,
        int& powerPercent,
        int& gapSec) const override;
};
