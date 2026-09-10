#pragma once

#include "modes/automatic/automatic_burst_runtime.h"
#include "modes/i_execution_mode.h"

class RelayController;
class AutomaticProgramBase;

typedef void (*AutomaticCompleteCallback)(
    void* context,
    const char* correlationId,
    bool success,
    const char* message,
    const char* resultJson);

class AutomaticSessionMode : public IExecutionMode {
public:
    void setRelay(RelayController* relay);

    bool beginSession(const char* payloadJson);

    bool requestStop(
        const char* correlationId,
        void* callbackContext,
        AutomaticCompleteCallback onComplete);

    /** Phase 11: validate, queue, apply after current stroke/gap (P11-D1/D7/D8). */
    bool queueSessionUpdate(const char* payloadJson);

    void setSessionNotifier(void* callbackContext, AutomaticCompleteCallback onNotify);

    void start(const char* payloadJson) override;
    void poll() override;
    void abort() override;
    bool isActive() const override;

private:
    enum class State { Idle, StartDelay, WaitingGap, Pulse, BurstPulse, BurstGap };

    static void onRelayPulseComplete(void* context, unsigned long actualMs);
    static void onBurstPulseComplete(void* context, unsigned long actualMs);

    void buildResultJson(const char* endReason, bool interrupted);
    void finishSession(bool success, const char* message, const char* endReason, bool interrupted);
    bool startNextPulse();
    bool shouldEndSession() const;
    bool beginBurstEvent();
    bool startNextBurstPulse();
    void finishBurstEvent();
    bool applyPendingUpdate();
    void assignAutomaticModeLabel(AutomaticRunMode mode);
    float computeSchedulePhaseOffset() const;
    bool configUsesScheduleTable(AutomaticRunMode mode) const;

    RelayController* relay_ = nullptr;
    AutomaticProgramBase* program_ = nullptr;
    State state_ = State::Idle;
    bool active_ = false;
    bool burstsOn_ = false;
    bool stopRequested_ = false;
    int strokeMs_ = 0;
    int powerPercent_ = 0;
    int gapSec_ = 0;
    int strokesCompleted_ = 0;
    /** Table programs (wave/build-up): row index base after replan (P11-D2). */
    int scheduleBaseStroke_ = 0;
    int burstEventsCompleted_ = 0;
    int intraBurstStrokesCompleted_ = 0;
    int burstStrokesTarget_ = 0;
    int burstStrokesCompletedInEvent_ = 0;
    int postBurstGapSec_ = 0;
    unsigned long burstDelayMs_ = 0;
    unsigned long burstGapStartMs_ = 0;
    AutomaticBurstPlan burstPlan_{};
    unsigned long sessionStartMs_ = 0;
    unsigned long delayStartMs_ = 0;
    unsigned long nextGapDeadlineMs_ = 0;
    char configJson_[768] = {};
    char pendingConfigJson_[768] = {};
    bool pendingUpdate_ = false;
    char automaticMode_[32] = {};
    int minimumStrokeMs_ = 25;
    int maximumStrokeMs_ = 400;
    int endSessionValue_ = 0;
    int endSessionMode_ = 0;
    char stopCorrelationId_[64] = {};
    char resultJson_[512] = {};
    void* callbackContext_ = nullptr;
    AutomaticCompleteCallback onComplete_ = nullptr;
    void* sessionNotifyContext_ = nullptr;
    AutomaticCompleteCallback sessionNotify_ = nullptr;
};
