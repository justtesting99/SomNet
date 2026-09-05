#include "relay_controller.h"

#include "boardDefs.h"

#include <Arduino.h>

void RelayController::begin() {
    pinMode(PIN_RELAY, OUTPUT);
    // Phase 1: keep relay in inactive state; no actuation until Phase 6
    digitalWrite(PIN_RELAY, RELAY_ACTIVE_HIGH ? LOW : HIGH);
    initialized_ = true;
}

void RelayController::poll() {
    // Phase 6: non-blocking pulse FSM
}

void RelayController::requestPulse(unsigned long /*strokeMs*/) {
    // Phase 6
}

void RelayController::abort() {
    // Phase 6
}
