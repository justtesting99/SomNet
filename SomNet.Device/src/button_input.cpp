#include "button_input.h"

#include "boardDefs.h"
#include "config.h"
#include "nvs_store.h"

#include <Arduino.h>

void ButtonInput::begin() {
    pinMode(PIN_BUTTON, INPUT_PULLUP);
}

void ButtonInput::handleFactoryResetHold(bool pressed) {
    if (!pressed) {
        pressStartedMs_ = 0;
        factoryResetWarned_ = false;
        factoryResetTriggered_ = false;
        return;
    }

    if (pressStartedMs_ == 0) {
        pressStartedMs_ = millis();
        return;
    }

    const unsigned long heldMs = millis() - pressStartedMs_;

    if (!factoryResetWarned_ && heldMs >= FACTORY_RESET_WARN_MS) {
        Serial.println(F("[BTN] hold 10s for factory reset..."));
        factoryResetWarned_ = true;
    }

    if (!factoryResetTriggered_ && heldMs >= FACTORY_RESET_HOLD_MS) {
        factoryResetTriggered_ = true;
        Serial.println(F("[NVS] factory reset — clearing all keys"));
        if (NvsStore* store = nvsStoreInstance()) {
            store->clearAll();
        }
        Serial.println(F("[BOOT] restarting..."));
        delay(100);
        ESP.restart();
    }
}

void ButtonInput::poll() {
    const bool pressed = digitalRead(PIN_BUTTON) == LOW;

    if (pressed && !lastPressed_) {
        const unsigned long now = millis();
        if (now - lastLogMs_ >= 500) {
            Serial.println(F("[BTN] pressed"));
            lastLogMs_ = now;
        }
    }

    handleFactoryResetHold(pressed);
    lastPressed_ = pressed;
}
