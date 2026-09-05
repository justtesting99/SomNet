#include "modes/single_pulse_mode.h"

#include "config.h"
#include "relay_controller.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <stdio.h>
#include <string.h>

void SinglePulseMode::setRelay(RelayController* relay) {
    relay_ = relay;
}

void SinglePulseMode::start(const char* /*payloadJson*/) {
    // Use beginStroke() — IExecutionMode entry point reserved for future wiring.
}

bool SinglePulseMode::beginStroke(
    const char* correlationId,
    const char* payloadJson,
    void* callbackContext,
    StrokeCompleteCallback onComplete) {
    if (relay_ == nullptr || correlationId == nullptr || correlationId[0] == '\0' || onComplete == nullptr) {
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

    if (!relay_->requestPulse(static_cast<unsigned long>(strokeMs), this, &SinglePulseMode::onRelayPulseComplete)) {
        Serial.println(F("[STROKE] reject: relay busy"));
        return false;
    }

    strncpy(correlationId_, correlationId, sizeof(correlationId_) - 1);
    correlationId_[sizeof(correlationId_) - 1] = '\0';
    callbackContext_ = callbackContext;
    onComplete_ = onComplete;
    strokeMs_ = strokeMs;
    powerPercent_ = powerPercent;
    active_ = true;
    resultJson_[0] = '\0';

    Serial.print(F("[STROKE] start strokeMs="));
    Serial.print(strokeMs_);
    Serial.print(F(" powerPercent="));
    Serial.println(powerPercent_);

    return true;
}

void SinglePulseMode::poll() {
}

void SinglePulseMode::onRelayPulseComplete(void* context, unsigned long actualMs) {
    if (context == nullptr) {
        return;
    }

    auto* mode = static_cast<SinglePulseMode*>(context);
    if (!mode->active_) {
        return;
    }

    mode->buildSuccessResultJson(actualMs);

    char message[96];
    snprintf(message, sizeof(message), "stroke %lums complete", static_cast<unsigned long>(actualMs));
    mode->complete(true, message, mode->resultJson_);
}

void SinglePulseMode::buildSuccessResultJson(unsigned long actualMs) {
    snprintf(
        resultJson_,
        sizeof(resultJson_),
        "{\"commandKey\":\"stroke\",\"powerPercent\":%d,\"requestedStrokeMs\":%d,"
        "\"actualStrokeMs\":%lu,\"success\":true}",
        powerPercent_,
        strokeMs_,
        actualMs);
}

void SinglePulseMode::buildAbortedResultJson(unsigned long actualMs) {
    snprintf(
        resultJson_,
        sizeof(resultJson_),
        "{\"commandKey\":\"stroke\",\"powerPercent\":%d,\"requestedStrokeMs\":%d,"
        "\"actualStrokeMs\":%lu,\"success\":false,\"interrupted\":true,\"reason\":\"abort\"}",
        powerPercent_,
        strokeMs_,
        actualMs);
}

void SinglePulseMode::abort() {
    if (!active_ || relay_ == nullptr) {
        return;
    }

    Serial.println(F("[STROKE] aborted"));
    const unsigned long actualMs = relay_->abort();
    buildAbortedResultJson(actualMs);
    complete(false, "stroke aborted", resultJson_);
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
