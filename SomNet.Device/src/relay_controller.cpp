#include "relay_controller.h"

#include "boardDefs.h"

#include <Arduino.h>

void RelayController::relayWrite(bool energized) {
    const int level = (energized == RELAY_ACTIVE_HIGH) ? HIGH : LOW;
    digitalWrite(PIN_RELAY, level);
}

void RelayController::begin() {
    pinMode(PIN_RELAY, OUTPUT);
    relayWrite(false);
    state_ = State::Idle;
    onSinceUs_ = 0;
    durationUs_ = 0;
    callbackContext_ = nullptr;
    onComplete_ = nullptr;
    initialized_ = true;
}

bool RelayController::requestPulse(unsigned long strokeMs, void* context, PulseCompleteCallback onComplete) {
    if (!initialized_ || strokeMs == 0 || onComplete == nullptr) {
        return false;
    }
    if (state_ != State::Idle) {
        return false;
    }

    durationUs_ = strokeMs * 1000UL;
    callbackContext_ = context;
    onComplete_ = onComplete;
    state_ = State::On;
    relayWrite(true);
    onSinceUs_ = micros();
    Serial.println(F("[RELAY] ON"));
    return true;
}

void RelayController::poll() {
    if (state_ != State::On) {
        return;
    }

    const uint32_t elapsedUs = micros() - onSinceUs_;
    if (elapsedUs < durationUs_) {
        return;
    }

    const unsigned long actualMs = (elapsedUs + 500UL) / 1000UL;
    relayWrite(false);
    Serial.print(F("[RELAY] OFF after "));
    Serial.print(actualMs);
    Serial.println(F("ms"));

    PulseCompleteCallback callback = onComplete_;
    void* context = callbackContext_;
    onComplete_ = nullptr;
    callbackContext_ = nullptr;
    state_ = State::Idle;
    durationUs_ = 0;
    onSinceUs_ = 0;

    if (callback != nullptr) {
        callback(context, actualMs);
    }
}

unsigned long RelayController::abort() {
    if (state_ != State::On) {
        return 0;
    }

    const uint32_t elapsedUs = micros() - onSinceUs_;
    const unsigned long actualMs = (elapsedUs + 500UL) / 1000UL;
    relayWrite(false);
    Serial.print(F("[RELAY] abort OFF after "));
    Serial.print(actualMs);
    Serial.println(F("ms"));

    onComplete_ = nullptr;
    callbackContext_ = nullptr;
    state_ = State::Idle;
    durationUs_ = 0;
    onSinceUs_ = 0;
    return actualMs;
}

bool RelayController::isActive() const {
    return state_ == State::On;
}
