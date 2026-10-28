#pragma once

#include "modes/automatic/automatic_burst_runtime.h"
#include "modes/automatic/automatic_config.h"
#include "modes/motor/motor_automatic_config.h"

/** Bench default micro-hold after ramp reaches burst duty (MA-D26). */
constexpr unsigned long kMotorBurstMicroHoldMs = 300UL;

/** Map motor automatic settings into relay burst planner input (schedule only). */
void motorBurstScheduleInput(const MotorAutomaticConfig& motorConfig, AutomaticConfig* outConfig);

/** MA-D27: periodic allows session-spread placements with minutes end only. */
bool motorBurstSettingsAllowed(const MotorAutomaticConfig& config);

/** Burst target speed 0–100 from burst-relative power and session speed envelope. */
int motorResolveBurstSpeedPercent(int burstRelativePower, const MotorAutomaticConfig& config);
