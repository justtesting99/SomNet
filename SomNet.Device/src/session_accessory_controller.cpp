#include "session_accessory_controller.h"

#include "boardDefs.h"

#include <Arduino.h>

namespace {

SessionAccessoryController* gSessionAccessoryInstance = nullptr;

} // namespace

void sessionAccessoryOnTransportLost() {
    if (gSessionAccessoryInstance != nullptr) {
        gSessionAccessoryInstance->releaseSafety();
    }
}

void SessionAccessoryController::writePin(bool energized) {
    const int level = (energized == SESSION_ACCESSORY_ACTIVE_HIGH) ? HIGH : LOW;
    digitalWrite(PIN_SESSION_ACCESSORY, level);
}

void SessionAccessoryController::begin() {
    pinMode(PIN_SESSION_ACCESSORY, OUTPUT);
    writePin(false);
    enabled_ = false;
    initialized_ = true;
    gSessionAccessoryInstance = this;
    Serial.println(F("[ACCESSORY] init OFF (GPIO32)"));
}

bool SessionAccessoryController::setEnabled(bool enabled) {
    if (!initialized_) {
        return false;
    }

    if (enabled_ == enabled) {
        Serial.print(F("[ACCESSORY] already "));
        Serial.println(enabled ? F("ON") : F("OFF"));
        return true;
    }

    enabled_ = enabled;
    writePin(enabled);
    Serial.print(F("[ACCESSORY] "));
    Serial.println(enabled ? F("ON") : F("OFF"));
    return true;
}

void SessionAccessoryController::releaseSafety() {
    if (!initialized_ || !enabled_) {
        return;
    }

    enabled_ = false;
    writePin(false);
    Serial.println(F("[ACCESSORY] safety release OFF (transport/Wi-Fi)"));
}
