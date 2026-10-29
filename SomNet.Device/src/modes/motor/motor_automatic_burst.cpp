#include "modes/motor/motor_automatic_burst.h"

namespace {

bool placementScheduleIsSessionSpread(BurstPlacement placement) {
    switch (placement) {
        case BurstPlacement::SessionSpread:
        case BurstPlacement::MainPlusSessionSpread:
        case BurstPlacement::InsteadOfSessionSpread:
            return true;
        default:
            return false;
    }
}

} // namespace

void motorBurstScheduleInput(const MotorAutomaticConfig& motorConfig, AutomaticConfig* outConfig) {
    if (outConfig == nullptr) {
        return;
    }

    *outConfig = AutomaticConfig{};
    outConfig->burstsOn = motorConfig.burstsOn;
    outConfig->burstPlacement = motorConfig.burstPlacement;
    outConfig->burstPercent = motorConfig.burstPercent;
    outConfig->burstStyle = motorConfig.burstStyle;
    outConfig->burstStrokePowerMin = motorConfig.burstStrokePowerMin;
    outConfig->burstStrokePowerMax = motorConfig.burstStrokePowerMax;
    outConfig->burstDelayMin = motorConfig.burstDelayMin;
    outConfig->burstDelayMax = motorConfig.burstDelayMax;
    outConfig->burstStrokesMin = motorConfig.burstStrokesMin;
    outConfig->burstStrokesMax = motorConfig.burstStrokesMax;
    outConfig->endSessionValue = motorConfig.endSessionValue;
    outConfig->endSessionMode =
        motorConfig.endSessionMode == MotorEndSessionMode::Minutes
            ? EndSessionMode::Minutes
            : EndSessionMode::NoAutoEnd;
    outConfig->minimumPower = motorConfig.minimumSpeedPercent;
    outConfig->maximumPower = motorConfig.maximumSpeedPercent;
    outConfig->valid = true;
}

bool motorBurstSettingsAllowed(const MotorAutomaticConfig& config) {
    if (!config.burstsOn) {
        return true;
    }

    if (config.mode == MotorAutomaticRunMode::Periodic) {
        if (config.endSessionMode != MotorEndSessionMode::Minutes) {
            return false;
        }
        return placementScheduleIsSessionSpread(config.burstPlacement);
    }

    return true;
}

int motorResolveBurstSpeedPercent(int burstRelativePower, const MotorAutomaticConfig& config) {
    const int duty = motorResolveBurstDutyPercent(burstRelativePower, config);
    return motorDutyPercentToSpeedPercent(duty, config);
}
