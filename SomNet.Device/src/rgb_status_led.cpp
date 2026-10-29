#include "rgb_status_led.h"

#include "boardDefs.h"
#include "config.h"

#include <Arduino.h>

namespace {

void writePin(int pin, bool on) {
    const bool level = RGB_LED_ACTIVE_HIGH ? on : !on;
    digitalWrite(pin, level ? HIGH : LOW);
}

} // namespace

const char* rgbOperatorStateName(RgbOperatorState state) {
    switch (state) {
    case RgbOperatorState::CredentialReset:
        return "credentialReset";
    case RgbOperatorState::Running:
        return "running";
    case RgbOperatorState::SessionActive:
        return "sessionActive";
    case RgbOperatorState::Ready:
        return "ready";
    case RgbOperatorState::AwaitingDeviceButton:
        return "awaitingDeviceButton";
    case RgbOperatorState::WifiUp:
        return "wifiUp";
    case RgbOperatorState::NoWifi:
        return "noWifi";
    }
    return "unknown";
}

RgbOperatorState resolveRgbOperatorState(const RgbStatusInputs& in) {
    if (in.credentialResetFlash) {
        return RgbOperatorState::CredentialReset;
    }
    if (in.provisioningSoftAp || !in.wifiStaUp) {
        return RgbOperatorState::NoWifi;
    }
    if (in.motionActive) {
        return RgbOperatorState::Running;
    }
    if (in.sessionActive) {
        return RgbOperatorState::SessionActive;
    }
    if (in.subReady) {
        return RgbOperatorState::Ready;
    }
    if (in.operatorAuthOk) {
        return RgbOperatorState::AwaitingDeviceButton;
    }
    return RgbOperatorState::WifiUp;
}

void RgbStatusLed::writeChannels(bool r, bool g, bool b) {
    writePin(PIN_LED_R, r);
    writePin(PIN_LED_G, g);
    writePin(PIN_LED_B, b);
}

void RgbStatusLed::applySolid(bool r, bool g, bool b) {
    writeChannels(r, g, b);
}

void RgbStatusLed::pollBlink(unsigned long intervalMs, bool r, bool g, bool b) {
    const unsigned long now = millis();
    if (now - lastToggleMs_ >= intervalMs) {
        lastToggleMs_ = now;
        blinkPhase_ = !blinkPhase_;
    }
    if (blinkPhase_) {
        writeChannels(r, g, b);
    } else {
        writeChannels(false, false, false);
    }
}

void RgbStatusLed::begin() {
    pinMode(PIN_LED_R, OUTPUT);
    pinMode(PIN_LED_G, OUTPUT);
    pinMode(PIN_LED_B, OUTPUT);
    writeChannels(false, false, false);
    lastToggleMs_ = millis();
    blinkPhase_ = false;
}

void RgbStatusLed::poll(const RgbStatusInputs& in) {
    const RgbOperatorState state = resolveRgbOperatorState(in);
    if (state != lastState_) {
        lastState_ = state;
        blinkPhase_ = false;
        lastToggleMs_ = millis();
        Serial.print(F("[RGB] "));
        Serial.println(rgbOperatorStateName(state));
    }
    switch (state) {
    case RgbOperatorState::CredentialReset:
        pollBlink(STATUS_LED_CREDENTIAL_RESET_BLINK_MS, true, false, false);
        break;
    case RgbOperatorState::Running:
        pollBlink(STATUS_LED_BLINK_MS, false, true, false);
        break;
    case RgbOperatorState::SessionActive:
        applySolid(false, true, false);
        break;
    case RgbOperatorState::Ready:
        applySolid(false, false, true);
        break;
    case RgbOperatorState::AwaitingDeviceButton:
        pollBlink(STATUS_LED_BLINK_MS, false, false, true);
        break;
    case RgbOperatorState::WifiUp:
        applySolid(true, false, false);
        break;
    case RgbOperatorState::NoWifi:
        pollBlink(STATUS_LED_BLINK_MS, true, false, false);
        break;
    }
}
