#pragma once

#include "modes/single_pulse_mode.h"

class ExecutionContext {
public:
    void begin();
    void poll();
    void abortActive();
    bool isActive() const;

    bool startSinglePulse(
        const char* correlationId,
        const char* payloadJson,
        void* callbackContext,
        StrokeCompleteCallback onComplete);

private:
    SinglePulseMode singlePulseMode_;
    IExecutionMode* activeMode_ = nullptr;
};
