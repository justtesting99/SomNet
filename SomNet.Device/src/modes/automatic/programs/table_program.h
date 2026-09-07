#pragma once

#include "modes/automatic/automatic_plan.h"
#include "modes/automatic/automatic_program_base.h"

/** Indexed schedule built at automatic-start (wave + build-up). */
class TableProgram : public AutomaticProgramBase {
public:
    TableProgram(StrokeScheduleRow* rows, size_t count);
    ~TableProgram() override;

    void getStrokeParameters(
        int strokeIndex,
        const AutomaticConfig& config,
        int& powerPercent,
        int& gapSec) const override;

private:
    StrokeScheduleRow* rows_;
    size_t count_;
};
