#pragma once

#include "modes/automatic/automatic_config.h"

class AutomaticProgramBase;

AutomaticProgramBase* createAutomaticProgram(const AutomaticConfig& config);
void destroyAutomaticProgram(AutomaticProgramBase* program);
