#pragma once

#include "modes/automatic_session_mode.h"
#include "modes/burst_sequence_mode.h"
#include "modes/single_pulse_mode.h"

class RelayController;

class ExecutionContext {
public:
    void begin(RelayController* relay);
    void poll();
    void abortActive();
    bool isActive() const;

    bool startSinglePulse(
        const char* correlationId,
        const char* payloadJson,
        void* callbackContext,
        StrokeCompleteCallback onComplete);

    bool startBurst(
        const char* correlationId,
        const char* payloadJson,
        void* callbackContext,
        BurstCompleteCallback onComplete);

    bool startAutomatic(const char* payloadJson);

    void setAutomaticSessionNotifier(void* callbackContext, AutomaticCompleteCallback onNotify);

    bool stopAutomatic(
        const char* correlationId,
        void* callbackContext,
        AutomaticCompleteCallback onComplete);

private:
    SinglePulseMode singlePulseMode_;
    BurstSequenceMode burstSequenceMode_;
    AutomaticSessionMode automaticSessionMode_;
    IExecutionMode* activeMode_ = nullptr;
    void* automaticSessionNotifyContext_ = nullptr;
    AutomaticCompleteCallback automaticSessionNotify_ = nullptr;
};
