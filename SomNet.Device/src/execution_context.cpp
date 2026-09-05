#include "execution_context.h"

#include "relay_controller.h"

void ExecutionContext::begin(RelayController* relay) {
    activeMode_ = nullptr;
    singlePulseMode_.setRelay(relay);
}

void ExecutionContext::poll() {
    if (activeMode_ != nullptr && activeMode_->isActive()) {
        activeMode_->poll();
        if (!activeMode_->isActive()) {
            activeMode_ = nullptr;
        }
    }
}

void ExecutionContext::abortActive() {
    if (activeMode_ != nullptr && activeMode_->isActive()) {
        activeMode_->abort();
        activeMode_ = nullptr;
    }
}

bool ExecutionContext::isActive() const {
    return activeMode_ != nullptr && activeMode_->isActive();
}

bool ExecutionContext::startSinglePulse(
    const char* correlationId,
    const char* payloadJson,
    void* callbackContext,
    StrokeCompleteCallback onComplete) {
    if (isActive()) {
        return false;
    }

    if (!singlePulseMode_.beginStroke(correlationId, payloadJson, callbackContext, onComplete)) {
        return false;
    }

    activeMode_ = &singlePulseMode_;
    return true;
}
