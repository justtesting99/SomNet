#pragma once

#include "modes/automatic/automatic_config.h"

class AutomaticProgramBase;

AutomaticProgramBase* createAutomaticProgram(
    const AutomaticConfig& config,
    float schedulePhaseOffsetNorm = 0.0f);
void destroyAutomaticProgram(AutomaticProgramBase* program);
