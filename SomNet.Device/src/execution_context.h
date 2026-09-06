#pragma once

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

private:
    SinglePulseMode singlePulseMode_;
    BurstSequenceMode burstSequenceMode_;
    IExecutionMode* activeMode_ = nullptr;
};
