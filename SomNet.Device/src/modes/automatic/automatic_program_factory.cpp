#include "modes/automatic/automatic_program_factory.h"

#include "modes/automatic/automatic_program_base.h"
#include "modes/automatic/programs/periodic_program.h"

#include <Arduino.h>

AutomaticProgramBase* createAutomaticProgram(const AutomaticConfig& config) {
    if (!config.valid) {
        return nullptr;
    }

    switch (config.mode) {
        case AutomaticRunMode::Periodic:
            return new PeriodicProgram();
        default:
            Serial.println(F("[AUTO] reject: program not implemented yet"));
            return nullptr;
    }
}

void destroyAutomaticProgram(AutomaticProgramBase* program) {
    delete program;
}
