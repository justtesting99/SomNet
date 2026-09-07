#include "modes/automatic/automatic_burst_runtime.h"

#include <climits>
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

/** P10-D19: every round(100 / burstPercent) main cadence opportunities. */
int burstCadenceStride(int burstPercent) {
    if (burstPercent <= 0) {
        return 0;
    }

    return (100 + burstPercent / 2) / burstPercent;
}

void buildStrokeMilestonePlan(int endSessionValue, int burstPercent, AutomaticBurstPlan* outPlan) {
    const int burstEventCount = roundPercentOfEnvelope(endSessionValue, burstPercent);
    if (burstEventCount <= 0) {
        return;
    }

    const int cappedCount =
        burstEventCount > AutomaticBurstPlan::kMaxBurstEvents
            ? AutomaticBurstPlan::kMaxBurstEvents
            : burstEventCount;

    outPlan->active = true;
    outPlan->kind = BurstScheduleKind::StrokeMilestones;
    outPlan->burstEventCount = cappedCount;
    outPlan->nextMilestoneIndex = 0;

    for (int k = 1; k <= cappedCount; ++k) {
        outPlan->milestones[k - 1] = (k * endSessionValue) / cappedCount;
        if (outPlan->milestones[k - 1] <= 0) {
            outPlan->milestones[k - 1] = 1;
        }
    }
}

void buildWallClockPlan(int endSessionMinutes, int burstPercent, AutomaticBurstPlan* outPlan) {
    const int burstEventCount = roundPercentOfEnvelope(endSessionMinutes, burstPercent);
    if (burstEventCount <= 0) {
        return;
    }

    const int cappedCount =
        burstEventCount > AutomaticBurstPlan::kMaxBurstEvents
            ? AutomaticBurstPlan::kMaxBurstEvents
            : burstEventCount;

    const unsigned long sessionBudgetMs =
        static_cast<unsigned long>(endSessionMinutes) * 60UL * 1000UL;

    outPlan->active = true;
    outPlan->kind = BurstScheduleKind::WallClockDeadlines;
    outPlan->burstEventCount = cappedCount;
    outPlan->nextMilestoneIndex = 0;

    for (int k = 1; k <= cappedCount; ++k) {
        const unsigned long offsetMs = (static_cast<unsigned long>(k) * sessionBudgetMs) / cappedCount;
        if (offsetMs > static_cast<unsigned long>(INT32_MAX)) {
            outPlan->milestones[k - 1] = INT32_MAX;
        } else {
            outPlan->milestones[k - 1] = static_cast<int>(offsetMs);
        }
    }
}

void buildCadenceStridePlan(int burstPercent, AutomaticBurstPlan* outPlan) {
    const int stride = burstCadenceStride(burstPercent);
    if (stride <= 0) {
        return;
    }

    outPlan->active = true;
    outPlan->kind = BurstScheduleKind::CadenceStride;
    outPlan->cadenceStride = stride;
    outPlan->nextCadenceTriggerStroke = stride;
}

} // namespace

void buildAutomaticBurstPlan(const AutomaticConfig& config, AutomaticBurstPlan* outPlan) {
    if (outPlan == nullptr) {
        return;
    }

    *outPlan = AutomaticBurstPlan{};

    if (!config.burstsOn || config.burstPercent <= 0) {
        return;
    }

    switch (config.endSessionMode) {
        case EndSessionMode::Strokes:
            if (config.endSessionValue > 0) {
                buildStrokeMilestonePlan(config.endSessionValue, config.burstPercent, outPlan);
            }
            break;

        case EndSessionMode::Minutes:
            if (config.endSessionValue > 0) {
                buildWallClockPlan(config.endSessionValue, config.burstPercent, outPlan);
            }
            break;

        case EndSessionMode::NoAutoEnd:
            buildCadenceStridePlan(config.burstPercent, outPlan);
            break;

        default:
            break;
    }
}

bool shouldTriggerBurstAfterMainStroke(const AutomaticBurstPlan& plan, int mainStrokesCompleted) {
    if (!plan.active) {
        return false;
    }

    switch (plan.kind) {
        case BurstScheduleKind::StrokeMilestones:
            if (plan.nextMilestoneIndex >= plan.burstEventCount) {
                return false;
            }
            return mainStrokesCompleted >= plan.milestones[plan.nextMilestoneIndex];

        case BurstScheduleKind::CadenceStride:
            return plan.nextCadenceTriggerStroke > 0 &&
                   mainStrokesCompleted >= plan.nextCadenceTriggerStroke;

        default:
            return false;
    }
}

bool shouldTriggerBurstInWaitingGap(
    const AutomaticBurstPlan& plan,
    unsigned long sessionStartMs,
    unsigned long nowMs) {
    if (!plan.active || plan.kind != BurstScheduleKind::WallClockDeadlines) {
        return false;
    }

    if (sessionStartMs == 0 || plan.nextMilestoneIndex >= plan.burstEventCount) {
        return false;
    }

    const unsigned long deadlineMs =
        sessionStartMs + static_cast<unsigned long>(plan.milestones[plan.nextMilestoneIndex]);
    return nowMs >= deadlineMs;
}

void advanceBurstPlan(AutomaticBurstPlan* plan) {
    if (plan == nullptr || !plan->active) {
        return;
    }

    switch (plan->kind) {
        case BurstScheduleKind::StrokeMilestones:
        case BurstScheduleKind::WallClockDeadlines:
            if (plan->nextMilestoneIndex < plan->burstEventCount) {
                plan->nextMilestoneIndex++;
            }
            break;

        case BurstScheduleKind::CadenceStride:
            plan->nextCadenceTriggerStroke += plan->cadenceStride;
            break;

        default:
            break;
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
