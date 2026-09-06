#include "modes/burst_sequence_mode.h"

#include "config.h"
#include "relay_controller.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <stdio.h>
#include <string.h>

void BurstSequenceMode::setRelay(RelayController* relay) {
    relay_ = relay;
}

void BurstSequenceMode::start(const char* /*payloadJson*/) {
    // Use beginBurst() — IExecutionMode entry point reserved for future wiring.
}

bool BurstSequenceMode::beginBurst(
    const char* correlationId,
    const char* payloadJson,
    void* callbackContext,
    BurstCompleteCallback onComplete) {
    if (relay_ == nullptr || correlationId == nullptr || correlationId[0] == '\0' || onComplete == nullptr) {
        return false;
    }

    if (active_) {
        return false;
    }

    StaticJsonDocument<256> doc;
    const DeserializationError err = deserializeJson(doc, payloadJson != nullptr ? payloadJson : "{}");
    if (err) {
        Serial.print(F("[BURST] payload JSON error: "));
        Serial.println(err.c_str());
        return false;
    }

    if (!doc["strokeMs"].is<int>() || !doc["burstStrokes"].is<int>() || !doc["burstDelayMs"].is<int>()) {
        Serial.println(F("[BURST] reject: strokeMs, burstStrokes, burstDelayMs required"));
        return false;
    }

    const int strokeMs = doc["strokeMs"].as<int>();
    const int burstStrokes = doc["burstStrokes"].as<int>();
    const int burstDelayMs = doc["burstDelayMs"].as<int>();

    if (strokeMs <= 0 || strokeMs > static_cast<int>(kMaxStrokeMs)) {
        Serial.println(F("[BURST] reject: strokeMs out of range"));
        return false;
    }

    if (burstStrokes <= 0 || burstStrokes > kMaxBurstStrokes) {
        Serial.println(F("[BURST] reject: burstStrokes out of range"));
        return false;
    }

    if (burstDelayMs < 0 || static_cast<unsigned long>(burstDelayMs) > kMaxBurstDelayMs) {
        Serial.println(F("[BURST] reject: burstDelayMs out of range"));
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
    burstStrokes_ = burstStrokes;
    burstDelayMs_ = static_cast<unsigned long>(burstDelayMs);
    strokesCompleted_ = 0;
    resultJson_[0] = '\0';
    active_ = true;

    Serial.print(F("[BURST] start strokes="));
    Serial.print(burstStrokes_);
    Serial.print(F(" strokeMs="));
    Serial.print(strokeMs_);
    Serial.print(F(" delayMs="));
    Serial.println(burstDelayMs_);

    if (!startNextStroke()) {
        active_ = false;
        state_ = State::Idle;
        onComplete_ = nullptr;
        callbackContext_ = nullptr;
        correlationId_[0] = '\0';
        return false;
    }

    return true;
}

bool BurstSequenceMode::startNextStroke() {
    if (relay_ == nullptr || !active_) {
        return false;
    }

    state_ = State::Pulse;
    if (!relay_->requestPulse(
            static_cast<unsigned long>(strokeMs_),
            this,
            &BurstSequenceMode::onRelayPulseComplete)) {
        Serial.println(F("[BURST] reject: relay busy"));
        state_ = State::Idle;
        return false;
    }

    return true;
}

void BurstSequenceMode::poll() {
    if (!active_ || state_ != State::Gap) {
        return;
    }

    if (millis() - gapStartMs_ < burstDelayMs_) {
        return;
    }

    if (!startNextStroke()) {
        buildInterruptedResultJson();
        complete(false, "burst failed — relay busy", resultJson_);
    }
}

void BurstSequenceMode::onRelayPulseComplete(void* context, unsigned long /*actualMs*/) {
    if (context == nullptr) {
        return;
    }

    auto* mode = static_cast<BurstSequenceMode*>(context);
    if (!mode->active_ || mode->state_ != State::Pulse) {
        return;
    }

    mode->strokesCompleted_++;
    Serial.print(F("[BURST] stroke "));
    Serial.print(mode->strokesCompleted_);
    Serial.print(F("/"));
    Serial.println(mode->burstStrokes_);

    if (mode->strokesCompleted_ >= mode->burstStrokes_) {
        mode->buildSuccessResultJson();
        mode->complete(true, "burst complete", mode->resultJson_);
        return;
    }

    if (mode->burstDelayMs_ == 0) {
        if (!mode->startNextStroke()) {
            mode->buildInterruptedResultJson();
            mode->complete(false, "burst failed — relay busy", mode->resultJson_);
        }
        return;
    }

    mode->state_ = State::Gap;
    mode->gapStartMs_ = millis();
}

void BurstSequenceMode::buildSuccessResultJson() {
    snprintf(
        resultJson_,
        sizeof(resultJson_),
        "{\"commandKey\":\"burst\",\"powerPercent\":%d,\"strokeMs\":%d,"
        "\"requestedStrokes\":%d,\"strokesCompleted\":%d,\"burstDelayMs\":%lu,\"interrupted\":false}",
        powerPercent_,
        strokeMs_,
        burstStrokes_,
        strokesCompleted_,
        burstDelayMs_);
}

void BurstSequenceMode::buildInterruptedResultJson() {
    snprintf(
        resultJson_,
        sizeof(resultJson_),
        "{\"commandKey\":\"burst\",\"powerPercent\":%d,\"strokeMs\":%d,"
        "\"requestedStrokes\":%d,\"strokesCompleted\":%d,\"burstDelayMs\":%lu,"
        "\"interrupted\":true,\"reason\":\"abort\"}",
        powerPercent_,
        strokeMs_,
        burstStrokes_,
        strokesCompleted_,
        burstDelayMs_);
}

void BurstSequenceMode::abort() {
    if (!active_) {
        return;
    }

    Serial.println(F("[BURST] aborted"));

    if (state_ == State::Pulse && relay_ != nullptr) {
        relay_->abort();
    }

    buildInterruptedResultJson();
    complete(false, "burst aborted", resultJson_);
}

void BurstSequenceMode::complete(bool success, const char* message, const char* resultJson) {
    active_ = false;
    state_ = State::Idle;
    strokesCompleted_ = 0;
    gapStartMs_ = 0;

    Serial.print(F("[BURST] complete success="));
    Serial.println(success ? F("true") : F("false"));

    if (onComplete_ != nullptr) {
        onComplete_(callbackContext_, correlationId_, success, message, resultJson);
    }

    onComplete_ = nullptr;
    callbackContext_ = nullptr;
    correlationId_[0] = '\0';
}

bool BurstSequenceMode::isActive() const {
    return active_;
}
