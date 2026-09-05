#include "button_input.h"

#include "boardDefs.h"

#include <Arduino.h>

void ButtonInput::begin() {
    pinMode(PIN_BUTTON, INPUT_PULLUP);
}

void ButtonInput::poll() {
    const bool pressed = digitalRead(PIN_BUTTON) == LOW;
    if (pressed && !lastPressed_) {
        const unsigned long now = millis();
        if (now - lastLogMs_ >= 500) {
            Serial.println(F("[BTN] pressed (stub — Phase 6)"));
            lastLogMs_ = now;
        }
    }
    lastPressed_ = pressed;
}
