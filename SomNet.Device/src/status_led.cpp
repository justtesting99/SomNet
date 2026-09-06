#include "status_led.h"

#include "boardDefs.h"
#include "config.h"

#include <Arduino.h>

void StatusLed::writeLit(bool lit) {
    const bool level = STATUS_LED_ACTIVE_HIGH ? lit : !lit;
    digitalWrite(PIN_STATUS_LED, level ? HIGH : LOW);
}

void StatusLed::begin() {
    pinMode(PIN_STATUS_LED, OUTPUT);
    writeLit(false);
    lastToggleMs_ = millis();
    blinkPhase_ = false;
}

void StatusLed::poll(bool hubConnected) {
    if (hubConnected) {
        writeLit(true);
        return;
    }

    const unsigned long now = millis();
    if (now - lastToggleMs_ >= STATUS_LED_BLINK_MS) {
        lastToggleMs_ = now;
        blinkPhase_ = !blinkPhase_;
        writeLit(blinkPhase_);
    }
}
