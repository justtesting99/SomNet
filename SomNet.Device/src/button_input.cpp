#include "button_input.h"

#include "boardDefs.h"
#include "config.h"
#include "nvs_store.h"

#include <Arduino.h>

void ButtonInput::begin() {
    pinMode(PIN_BUTTON, INPUT_PULLUP);
}

void ButtonInput::setClickHandler(ButtonClickHandler handler, void* context) {
    clickHandler_ = handler;
    clickContext_ = context;
}

void ButtonInput::emitClick(ButtonClickKind kind) {
    if (clickHandler_ == nullptr) {
        return;
    }

    if (kind == ButtonClickKind::Single) {
        Serial.println(F("[BTN] single"));
    } else {
        Serial.println(F("[BTN] double"));
    }

    clickHandler_(kind, clickContext_);
}

void ButtonInput::pollPendingSingle() {
    if (!pendingSingle_) {
        return;
    }

    if (static_cast<long>(millis() - singleFireAtMs_) >= 0) {
        pendingSingle_ = false;
        emitClick(ButtonClickKind::Single);
    }
}

void ButtonInput::onPressEdge() {
    pressStartedMs_ = millis();
}

void ButtonInput::onReleaseEdge() {
    if (credentialResetAwaitRelease_ || credentialResetTriggered_) {
        pressStartedMs_ = 0;
        return;
    }

    if (pressStartedMs_ == 0) {
        return;
    }

    const unsigned long heldMs = millis() - pressStartedMs_;
    pressStartedMs_ = 0;

    if (heldMs >= CREDENTIAL_RESET_WARN_MS) {
        Serial.println(F("[BTN] click ignored (hold reset)"));
        pendingSingle_ = false;
        return;
    }

    if (heldMs > BUTTON_CLICK_MAX_MS) {
        Serial.println(F("[BTN] click ignored (long press)"));
        pendingSingle_ = false;
        return;
    }

    if (pendingSingle_) {
        pendingSingle_ = false;
        emitClick(ButtonClickKind::Double);
        return;
    }

    pendingSingle_ = true;
    singleFireAtMs_ = millis() + BUTTON_SINGLE_FIRE_MS;
}

void ButtonInput::handleCredentialResetHold(bool pressed) {
    if (credentialResetAwaitRelease_ && !pressed) {
        Serial.println(F("[BTN] released — rebooting to setup AP"));
        delay(100);
        ESP.restart();
    }

    if (!pressed) {
        if (!credentialResetAwaitRelease_) {
            pressStartedMs_ = 0;
        }
        credentialResetWarned_ = false;
        if (!credentialResetAwaitRelease_) {
            credentialResetTriggered_ = false;
        }
        return;
    }

    if (credentialResetAwaitRelease_) {
        return;
    }

    if (pressStartedMs_ == 0) {
        pressStartedMs_ = millis();
        return;
    }

    const unsigned long heldMs = millis() - pressStartedMs_;

    if (!credentialResetWarned_ && heldMs >= CREDENTIAL_RESET_WARN_MS) {
        pendingSingle_ = false;
        Serial.println(F("[BTN] keep holding 10s — fast LED flash when reset, then release"));
        credentialResetWarned_ = true;
    }

    if (!credentialResetTriggered_ && heldMs >= CREDENTIAL_RESET_HOLD_MS) {
        credentialResetTriggered_ = true;
        credentialResetAwaitRelease_ = true;
        pendingSingle_ = false;
        Serial.println(F("[NVS] credential reset — clearing Wi-Fi and server settings"));
        if (NvsStore* store = nvsStoreInstance()) {
            store->clearProvisioning();
        }
        Serial.println(F("[BTN] fast flash — release button to reboot to setup AP"));
    }
}

void ButtonInput::poll() {
    const bool rawPressed = digitalRead(PIN_BUTTON) == LOW;

    if (rawPressed != lastRawPressed_) {
        lastDebounceMs_ = millis();
    }

    if ((millis() - lastDebounceMs_) >= BUTTON_DEBOUNCE_MS) {
        if (rawPressed != debouncedPressed_) {
            const bool wasPressed = debouncedPressed_;
            debouncedPressed_ = rawPressed;

            if (debouncedPressed_ && !wasPressed) {
                onPressEdge();
            } else if (!debouncedPressed_ && wasPressed) {
                onReleaseEdge();
            }
        }
    }

    lastRawPressed_ = rawPressed;

    if (debouncedPressed_ && !lastPressed_) {
        const unsigned long now = millis();
        if (now - lastLogMs_ >= 500) {
            Serial.println(F("[BTN] pressed"));
            lastLogMs_ = now;
        }
    }

    handleCredentialResetHold(debouncedPressed_);
    pollPendingSingle();
    lastPressed_ = debouncedPressed_;
}
