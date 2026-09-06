#pragma once

#include "modes/i_execution_mode.h"

#include <stddef.h>

class RelayController;

typedef void (*BurstCompleteCallback)(
    void* context,
    const char* correlationId,
    bool success,
    const char* message,
    const char* resultJson);

class BurstSequenceMode : public IExecutionMode {
public:
    void setRelay(RelayController* relay);

    bool beginBurst(
        const char* correlationId,
        const char* payloadJson,
        void* callbackContext,
        BurstCompleteCallback onComplete);

    void start(const char* payloadJson) override;
    void poll() override;
    void abort() override;
    bool isActive() const override;

private:
    enum class State { Idle, Pulse, Gap };

    static void onRelayPulseComplete(void* context, unsigned long actualMs);

    void buildSuccessResultJson();
    void buildInterruptedResultJson();
    void complete(bool success, const char* message, const char* resultJson);
    bool startNextStroke();

    RelayController* relay_ = nullptr;
    State state_ = State::Idle;
    bool active_ = false;
    int strokeMs_ = 0;
    int powerPercent_ = 0;
    int burstStrokes_ = 0;
    unsigned long burstDelayMs_ = 0;
    int strokesCompleted_ = 0;
    unsigned long gapStartMs_ = 0;
    char correlationId_[64] = {};
    char resultJson_[384] = {};
    void* callbackContext_ = nullptr;
    BurstCompleteCallback onComplete_ = nullptr;
};
