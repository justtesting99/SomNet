#include "modes/automatic/automatic_burst_runtime.h"

#include <esp_system.h>

namespace {

int randomInclusive(int lo, int hi) {
    if (lo > hi) {
        const int tmp = lo;
        lo = hi;
        hi = tmp;
    }

    if (lo == hi) {
        return lo;
    }

    const uint32_t span = static_cast<uint32_t>(hi - lo + 1);
    return lo + static_cast<int>(esp_random() % span);
}

int roundPercentOfEnvelope(int envelope, int burstPercent) {
    if (envelope <= 0 || burstPercent <= 0) {
        return 0;
    }

    return (envelope * burstPercent + 50) / 100;
}

} // namespace

void buildAutomaticBurstPlan(const AutomaticConfig& config, AutomaticBurstPlan* outPlan) {
    if (outPlan == nullptr) {
        return;
    }

    *outPlan = AutomaticBurstPlan{};

    if (!config.burstsOn || config.mode != AutomaticRunMode::Periodic) {
        return;
    }

    if (config.endSessionMode != EndSessionMode::Strokes || config.endSessionValue <= 0) {
        return;
    }

    const int burstEventCount = roundPercentOfEnvelope(config.endSessionValue, config.burstPercent);
    if (burstEventCount <= 0) {
        return;
    }

    const int cappedCount =
        burstEventCount > AutomaticBurstPlan::kMaxBurstEvents
            ? AutomaticBurstPlan::kMaxBurstEvents
            : burstEventCount;

    outPlan->active = true;
    outPlan->burstEventCount = cappedCount;
    outPlan->nextMilestoneIndex = 0;

    for (int k = 1; k <= cappedCount; ++k) {
        outPlan->milestones[k - 1] = (k * config.endSessionValue) / cappedCount;
        if (outPlan->milestones[k - 1] <= 0) {
            outPlan->milestones[k - 1] = 1;
        }
    }
}

bool shouldTriggerBurstEvent(const AutomaticBurstPlan& plan, int mainStrokesCompleted) {
    if (!plan.active || plan.nextMilestoneIndex >= plan.burstEventCount) {
        return false;
    }

    return mainStrokesCompleted >= plan.milestones[plan.nextMilestoneIndex];
}

void advanceBurstPlan(AutomaticBurstPlan* plan) {
    if (plan == nullptr || !plan->active) {
        return;
    }

    if (plan->nextMilestoneIndex < plan->burstEventCount) {
        plan->nextMilestoneIndex++;
    }
}

int drawBurstStrokeCount(const AutomaticConfig& config) {
    return randomInclusive(config.burstStrokesMin, config.burstStrokesMax);
}

int drawBurstRelativePower(const AutomaticConfig& config) {
    switch (config.burstStyle) {
        case BurstStyle::RandomPowerOnly:
        case BurstStyle::RandomPowerAndDelay:
            return randomInclusive(config.burstStrokePowerMin, config.burstStrokePowerMax);

        case BurstStyle::FixedPowerDelay:
        case BurstStyle::RandomDelayOnly:
        default:
            return config.burstStrokePowerMax;
    }
}

int drawBurstDelaySec(const AutomaticConfig& config) {
    switch (config.burstStyle) {
        case BurstStyle::RandomDelayOnly:
        case BurstStyle::RandomPowerAndDelay:
            return randomInclusive(config.burstDelayMin, config.burstDelayMax);

        case BurstStyle::FixedPowerDelay:
        case BurstStyle::RandomPowerOnly:
        default:
            return config.burstDelayMax;
    }
}

int resolveBurstEffectivePower(int burstRelativePower, const AutomaticConfig& config) {
    if (burstRelativePower < 0) {
        burstRelativePower = 0;
    }
    if (burstRelativePower > 100) {
        burstRelativePower = 100;
    }

    const int minPower = config.minimumPower;
    const int maxPower = config.maximumPower;
    return minPower + ((maxPower - minPower) * burstRelativePower) / 100;
}
