#include "execution_context.h"

#include "modes/i_execution_mode.h"

void ExecutionContext::begin() {
    activeMode_ = nullptr;
}

void ExecutionContext::poll() {
    if (activeMode_ != nullptr && activeMode_->isActive()) {
        activeMode_->poll();
    }
}

void ExecutionContext::abortActive() {
    if (activeMode_ != nullptr && activeMode_->isActive()) {
        activeMode_->abort();
    }
}

bool ExecutionContext::isActive() const {
    return activeMode_ != nullptr && activeMode_->isActive();
}
