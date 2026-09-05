#include "modes/automatic_session_mode.h"

void AutomaticSessionMode::start(const char* /*payloadJson*/) {
    // Phase 9
    active_ = false;
}

void AutomaticSessionMode::poll() {
}

void AutomaticSessionMode::abort() {
    active_ = false;
}

bool AutomaticSessionMode::isActive() const {
    return active_;
}
