#include "modes/single_pulse_mode.h"

#include <Arduino.h>

void SinglePulseMode::start(const char* /*payloadJson*/) {
    // Phase 5: parse strokeMs, delegate to relay_controller
    active_ = false;
}

void SinglePulseMode::poll() {
}

void SinglePulseMode::abort() {
    active_ = false;
}

bool SinglePulseMode::isActive() const {
    return active_;
}
