#include "modes/burst_sequence_mode.h"

void BurstSequenceMode::start(const char* /*payloadJson*/) {
    // Phase 9
    active_ = false;
}

void BurstSequenceMode::poll() {
}

void BurstSequenceMode::abort() {
    active_ = false;
}

bool BurstSequenceMode::isActive() const {
    return active_;
}
