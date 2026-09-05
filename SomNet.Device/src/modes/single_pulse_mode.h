#pragma once

#include "modes/i_execution_mode.h"

#include <stddef.h>

class RelayController;

typedef void (*StrokeCompleteCallback)(
    void* context,
    const char* correlationId,
    bool success,
    const char* message,
    const char* resultJson);

class SinglePulseMode : public IExecutionMode {
public:
    void setRelay(RelayController* relay);

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
    static void onRelayPulseComplete(void* context, unsigned long actualMs);

    void buildSuccessResultJson(unsigned long actualMs);
    void buildAbortedResultJson(unsigned long actualMs);
    void complete(bool success, const char* message, const char* resultJson);

    RelayController* relay_ = nullptr;
    bool active_ = false;
    int strokeMs_ = 0;
    int powerPercent_ = 0;
    char correlationId_[64] = {};
    char resultJson_[320] = {};
    void* callbackContext_ = nullptr;
    StrokeCompleteCallback onComplete_ = nullptr;
};
