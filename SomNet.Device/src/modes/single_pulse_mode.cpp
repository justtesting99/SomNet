#include "modes/single_pulse_mode.h"

#include "config.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <stdio.h>
#include <string.h>

void SinglePulseMode::start(const char* /*payloadJson*/) {
    // Use beginStroke() — IExecutionMode entry point reserved for future wiring.
}

bool SinglePulseMode::beginStroke(
    const char* correlationId,
    const char* payloadJson,
    void* callbackContext,
    StrokeCompleteCallback onComplete) {
    if (correlationId == nullptr || correlationId[0] == '\0' || onComplete == nullptr) {
        return false;
    }

    StaticJsonDocument<256> doc;
    const DeserializationError err = deserializeJson(doc, payloadJson != nullptr ? payloadJson : "{}");
    if (err) {
        Serial.print(F("[STROKE] payload JSON error: "));
        Serial.println(err.c_str());
        return false;
    }

    if (!doc["strokeMs"].is<int>()) {
        Serial.println(F("[STROKE] reject: strokeMs required"));
        return false;
    }

    const int strokeMs = doc["strokeMs"].as<int>();
    if (strokeMs <= 0 || strokeMs > kMaxStrokeMs) {
        Serial.print(F("[STROKE] reject: strokeMs out of range (1-"));
        Serial.println(kMaxStrokeMs);
        return false;
    }

    int powerPercent = doc["powerPercent"] | 0;
    if (powerPercent < 0) {
        powerPercent = 0;
    }
    if (powerPercent > 100) {
        powerPercent = 100;
    }

    strncpy(correlationId_, correlationId, sizeof(correlationId_) - 1);
    correlationId_[sizeof(correlationId_) - 1] = '\0';
    callbackContext_ = callbackContext;
    onComplete_ = onComplete;
    strokeMs_ = strokeMs;
    powerPercent_ = powerPercent;
    durationMs_ = static_cast<unsigned long>(strokeMs);
    startMs_ = millis();
    active_ = true;
    resultJson_[0] = '\0';

    Serial.print(F("[STROKE] start strokeMs="));
    Serial.print(strokeMs_);
    Serial.print(F(" powerPercent="));
    Serial.println(powerPercent_);

    return true;
}

void SinglePulseMode::poll() {
    if (!active_) {
        return;
    }

    const unsigned long elapsed = millis() - startMs_;
    if (elapsed < durationMs_) {
        return;
    }

    snprintf(
        resultJson_,
        sizeof(resultJson_),
        "{\"commandKey\":\"stroke\",\"powerPercent\":%d,\"requestedStrokeMs\":%d,\"actualStrokeMs\":%d,\"success\":true}",
        powerPercent_,
        strokeMs_,
        strokeMs_);

    char message[96];
    snprintf(message, sizeof(message), "stroke %dms complete (simulated)", strokeMs_);
    complete(true, message, resultJson_);
}

void SinglePulseMode::abort() {
    if (!active_) {
        return;
    }

    Serial.println(F("[STROKE] aborted"));
    complete(false, "stroke aborted", nullptr);
}

void SinglePulseMode::complete(bool success, const char* message, const char* resultJson) {
    active_ = false;

    Serial.print(F("[STROKE] complete success="));
    Serial.println(success ? F("true") : F("false"));

    if (onComplete_ != nullptr) {
        onComplete_(callbackContext_, correlationId_, success, message, resultJson);
    }

    onComplete_ = nullptr;
    callbackContext_ = nullptr;
    correlationId_[0] = '\0';
}

bool SinglePulseMode::isActive() const {
    return active_;
}
