#pragma once

#include "modes/automatic/automatic_burst_runtime.h"
#include "modes/motor/motor_automatic_config.h"
#include "modes/motor/motor_session_callbacks.h"

class MotorController;

class MotorAutomaticSessionMode {
public:
    void setMotor(MotorController* motor);

    bool beginSession(const char* payloadJson);

    bool queueSessionUpdate(const char* payloadJson);

    bool requestStop(
        const char* correlationId,
        void* callbackContext,
        AutomaticCompleteCallback onComplete);

    void setSessionNotifier(void* callbackContext, AutomaticCompleteCallback onNotify);

    void setSegmentNotifier(void* callbackContext, MotorAutomaticSegmentCallback onNotify);

    void poll();
    void abort();
    bool isActive() const;

private:
    enum class State {
        Idle,
        StartDelay,
        /** Linear ramp from segment start speed to segment end speed over the segment interval. */
        SegmentRamp,
        /** Set Speed (periodic) — ramp to target then hold until stop/end. */
        SetSpeedHold,
        /** Cooperative stop / end session — ramp to zero using configured stop rampMs. */
        RampToStop,
        BurstMicroRamp,
        BurstHold,
        BurstGap,
    };

    void buildResultJson(const char* endReason, bool interrupted);
    void finishSession(bool success, const char* message, const char* endReason, bool interrupted);
    bool shouldEndSession() const;
    bool beginSegmentTransition();
    bool beginSetSpeedHold();
    int pickSegmentSeconds() const;
    bool applyPendingUpdate();
    void requestRampToStop();
    void emitSegmentRamp(
        int segmentIndex,
        int fromSpeedPercent,
        int toSpeedPercent,
        unsigned long durationMs);
    bool loadConfig(MotorAutomaticConfig* outConfig) const;
    void rebuildBurstPlan();
    bool beginBurstEvent();
    bool startNextBurstMicro();
    void finishBurstEvent();
    void handleCompletedMainSegment();
    bool maybeTriggerWallClockBurst();
    void pollBurstStates();
    bool tryContinueProgramAfterGap();
    unsigned long segmentTransitionRampMs(const MotorAutomaticConfig& config) const;
    unsigned long periodicInitialRampMs(const MotorAutomaticConfig& config) const;
    unsigned long burstMicroTransitionRampMs(const MotorAutomaticConfig& config) const;

    MotorController* motor_ = nullptr;
    State state_ = State::Idle;
    bool active_ = false;
    bool stopRequested_ = false;
    int dutyPercent_ = 0;
    /** Used for stop/abort ramps (payload rampMs). Between-segment ramps use segment duration. */
    unsigned long stopRampMs_ = 500;
    unsigned long segmentDurationMs_ = 0;
    unsigned long segmentHoldDeadlineMs_ = 0;
    unsigned long segmentHoldTelemetryPendingMs_ = 0;
    int segmentHoldTelemetrySpeedPercent_ = 0;
    unsigned long burstMicroHoldTelemetryPendingMs_ = 0;
    int burstMicroHoldTelemetrySpeedPercent_ = 0;
    int lastCommandedSpeedPercent_ = 0;
    int segmentsCompleted_ = 0;
    int endSessionValue_ = 0;
    int endSessionModeWire_ = 0;
    unsigned long sessionStartMs_ = 0;
    unsigned long phaseDeadlineMs_ = 0;
    unsigned long delayStartMs_ = 0;
    bool burstsOn_ = false;
    AutomaticBurstPlan burstPlan_{};
    int burstEventsCompleted_ = 0;
    int burstStrokesTarget_ = 0;
    int burstStrokesCompletedInEvent_ = 0;
    int burstGapSec_ = 0;
    unsigned long burstPhaseDeadlineMs_ = 0;
    int resumeSpeedPercent_ = 0;
    State resumeState_ = State::Idle;
    char configJson_[1536] = {};
    char pendingConfigJson_[1536] = {};
    bool pendingUpdate_ = false;
    char resultJson_[640] = {};
    char stopCorrelationId_[64] = {};
    void* callbackContext_ = nullptr;
    AutomaticCompleteCallback onComplete_ = nullptr;
    void* sessionNotifyContext_ = nullptr;
    AutomaticCompleteCallback sessionNotify_ = nullptr;
    void* segmentNotifyContext_ = nullptr;
    MotorAutomaticSegmentCallback segmentNotify_ = nullptr;
};
