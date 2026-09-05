#pragma once

#include "modes/i_execution_mode.h"

#include <stddef.h>

typedef void (*StrokeCompleteCallback)(
    void* context,
    const char* correlationId,
    bool success,
    const char* message,
    const char* resultJson);

class SinglePulseMode : public IExecutionMode {
public:
    bool beginStroke(
        const char* correlationId,
        const char* payloadJson,
        void* callbackContext,
        StrokeCompleteCallback onComplete);

    void start(const char* payloadJson) override;
    void poll() override;
    void abort() override;
    bool isActive() const override;

private:
    void complete(bool success, const char* message, const char* resultJson);

    bool active_ = false;
    unsigned long startMs_ = 0;
    unsigned long durationMs_ = 0;
    int strokeMs_ = 0;
    int powerPercent_ = 0;
    char correlationId_[64] = {};
    char resultJson_[256] = {};
    void* callbackContext_ = nullptr;
    StrokeCompleteCallback onComplete_ = nullptr;
};
