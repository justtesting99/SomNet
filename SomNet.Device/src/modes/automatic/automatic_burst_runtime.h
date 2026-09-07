#pragma once

#include "modes/automatic/automatic_config.h"

enum class BurstScheduleKind {
    None,
    StrokeMilestones,
    WallClockDeadlines,
    CadenceStride,
};

struct AutomaticBurstPlan {
    bool active = false;
    BurstScheduleKind kind = BurstScheduleKind::None;
    int burstEventCount = 0;
    int nextMilestoneIndex = 0;
    static constexpr int kMaxBurstEvents = 100;
    /** Stroke milestones (strokes mode) or deadline offset ms from sessionStart (minutes mode). */
    int milestones[kMaxBurstEvents] = {};
    /** noAutoEnd: burst every N main strokes (P10-D19). */
    int cadenceStride = 0;
    int nextCadenceTriggerStroke = 0;
};

/** Build burst schedule from end-session envelope (all programs — Phase 10C). */
void buildAutomaticBurstPlan(const AutomaticConfig& config, AutomaticBurstPlan* outPlan);

/** After a main stroke completes (stroke milestones or noAutoEnd stride). */
bool shouldTriggerBurstAfterMainStroke(const AutomaticBurstPlan& plan, int mainStrokesCompleted);

/** In WaitingGap between main strokes (minutes wall-clock deadlines — P10-D22). */
bool shouldTriggerBurstInWaitingGap(
    const AutomaticBurstPlan& plan,
    unsigned long sessionStartMs,
    unsigned long nowMs);

void advanceBurstPlan(AutomaticBurstPlan* plan);

int drawBurstStrokeCount(const AutomaticConfig& config);

/** Burst-relative power 0-100 per burst style (P10-D12: fresh draw per stroke). */
int drawBurstRelativePower(const AutomaticConfig& config);

/** Intra-burst delay seconds (P10-D12: fresh draw per gap when randomized). */
int drawBurstDelaySec(const AutomaticConfig& config);

/** Map burst-relative 0-100 into session power envelope (P10-D5 / SS2.2). */
int resolveBurstEffectivePower(int burstRelativePower, const AutomaticConfig& config);
