#pragma once

#include "modes/automatic/automatic_config.h"

struct AutomaticBurstPlan {
    bool active = false;
    int burstEventCount = 0;
    int nextMilestoneIndex = 0;
    static constexpr int kMaxBurstEvents = 100;
    int milestones[kMaxBurstEvents] = {};
};

/** Build stroke-milestone burst schedule (Periodic + endSession strokes — Phase 10B). */
void buildAutomaticBurstPlan(const AutomaticConfig& config, AutomaticBurstPlan* outPlan);

bool shouldTriggerBurstEvent(const AutomaticBurstPlan& plan, int mainStrokesCompleted);

void advanceBurstPlan(AutomaticBurstPlan* plan);

int drawBurstStrokeCount(const AutomaticConfig& config);

/** Burst-relative power 0-100 per burst style (P10-D12: fresh draw per stroke). */
int drawBurstRelativePower(const AutomaticConfig& config);

/** Intra-burst delay seconds (P10-D12: fresh draw per gap when randomized). */
int drawBurstDelaySec(const AutomaticConfig& config);

/** Map burst-relative 0-100 into session power envelope (P10-D5 / SS2.2). */
int resolveBurstEffectivePower(int burstRelativePower, const AutomaticConfig& config);
