#pragma once

#include "modes/automatic/automatic_config.h"
#include "modes/automatic/automatic_program_base.h"

/** On-the-fly uniform random power and/or gap (P9P2-D36). */
class RandomProgram : public AutomaticProgramBase {
public:
    explicit RandomProgram(AutomaticRunMode mode);

    void getStrokeParameters(
        int strokeIndex,
        const AutomaticConfig& config,
        int& powerPercent,
        int& gapSec) const override;

private:
    AutomaticRunMode mode_;
};
