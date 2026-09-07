#include "modes/automatic/automatic_program_factory.h"

#include "modes/automatic/automatic_plan.h"
#include "modes/automatic/automatic_program_base.h"
#include "modes/automatic/programs/periodic_program.h"
#include "modes/automatic/programs/random_program.h"
#include "modes/automatic/programs/table_program.h"

#include <Arduino.h>

AutomaticProgramBase* createAutomaticProgram(const AutomaticConfig& config) {
    if (!config.valid) {
        return nullptr;
    }

    switch (config.mode) {
        case AutomaticRunMode::Periodic:
            return new PeriodicProgram();
        case AutomaticRunMode::RandomPowerOnly:
        case AutomaticRunMode::RandomTimingOnly:
        case AutomaticRunMode::RandomPowerAndTiming:
            return new RandomProgram(config.mode);
        case AutomaticRunMode::PowerWave:
        case AutomaticRunMode::PowerAndTimingWave:
        case AutomaticRunMode::BuildUp: {
            StrokeScheduleRow* rows = nullptr;
            size_t count = 0;
            if (!buildStrokeSchedule(config, &rows, &count)) {
                return nullptr;
            }

            Serial.print(F("[AUTO] schedule rows="));
            Serial.println(static_cast<unsigned>(count));
            return new TableProgram(rows, count);
        }
        default:
            Serial.println(F("[AUTO] reject: program not implemented yet"));
            return nullptr;
    }
}

void destroyAutomaticProgram(AutomaticProgramBase* program) {
    delete program;
}
