#pragma once

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
    };

    void buildResultJson(const char* endReason, bool interrupted);
    void finishSession(bool success, const char* message, const char* endReason, bool interrupted);
    bool shouldEndSession() const;
    bool beginSegmentTransition();
    bool beginSetSpeedHold();
    int pickSegmentSeconds() const;
    bool applyPendingUpdate();
    void requestRampToStop();

    MotorController* motor_ = nullptr;
    State state_ = State::Idle;
    bool active_ = false;
    bool stopRequested_ = false;
    int dutyPercent_ = 0;
    /** Used for stop/abort ramps (payload rampMs). Between-segment ramps use segment duration. */
    unsigned long stopRampMs_ = 500;
    unsigned long segmentDurationMs_ = 0;
    int segmentsCompleted_ = 0;
    int endSessionValue_ = 0;
    int endSessionModeWire_ = 0;
    unsigned long sessionStartMs_ = 0;
    unsigned long phaseDeadlineMs_ = 0;
    unsigned long delayStartMs_ = 0;
    char configJson_[768] = {};
    char pendingConfigJson_[768] = {};
    bool pendingUpdate_ = false;
    char resultJson_[512] = {};
    char stopCorrelationId_[64] = {};
    void* callbackContext_ = nullptr;
    AutomaticCompleteCallback onComplete_ = nullptr;
    void* sessionNotifyContext_ = nullptr;
    AutomaticCompleteCallback sessionNotify_ = nullptr;
};
