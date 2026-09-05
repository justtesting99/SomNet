#include "button_input.h"

#include "boardDefs.h"
#include "config.h"
#include "nvs_store.h"

#include <Arduino.h>

void ButtonInput::begin() {
    pinMode(PIN_BUTTON, INPUT_PULLUP);
}

void ButtonInput::handleCredentialResetHold(bool pressed) {
    if (!pressed) {
        pressStartedMs_ = 0;
        credentialResetWarned_ = false;
        credentialResetTriggered_ = false;
        return;
    }

    if (pressStartedMs_ == 0) {
        pressStartedMs_ = millis();
        return;
    }

    const unsigned long heldMs = millis() - pressStartedMs_;

    if (!credentialResetWarned_ && heldMs >= CREDENTIAL_RESET_WARN_MS) {
        Serial.println(F("[BTN] keep holding 10s to reset Wi-Fi / server credentials..."));
        credentialResetWarned_ = true;
    }

    if (!credentialResetTriggered_ && heldMs >= CREDENTIAL_RESET_HOLD_MS) {
        credentialResetTriggered_ = true;
        Serial.println(F("[NVS] credential reset — clearing Wi-Fi and server settings"));
        if (NvsStore* store = nvsStoreInstance()) {
            store->clearProvisioning();
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

    handleCredentialResetHold(pressed);
    lastPressed_ = pressed;
}
