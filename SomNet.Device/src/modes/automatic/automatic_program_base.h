#pragma once

#include "modes/automatic/automatic_config.h"

class AutomaticProgramBase {
public:
    virtual ~AutomaticProgramBase() = default;

    virtual void getStrokeParameters(
        int strokeIndex,
        const AutomaticConfig& config,
        int& powerPercent,
        int& gapSec) const = 0;
};
