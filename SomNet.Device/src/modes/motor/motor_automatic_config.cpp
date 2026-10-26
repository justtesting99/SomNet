#include "modes/motor/motor_automatic_config.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <string.h>

namespace {

bool readIntField(JsonObjectConst root, const char* key, int* out) {
    if (!root[key].is<int>()) {
        return false;
    }
    *out = root[key].as<int>();
    return true;
}

} // namespace

int motorEndSessionModeToWire(MotorEndSessionMode mode) {
    return mode == MotorEndSessionMode::Minutes ? 1 : 0;
}

bool parseMotorAutomaticConfig(const char* payloadJson, MotorAutomaticConfig* outConfig) {
    if (outConfig == nullptr) {
        return false;
    }

    *outConfig = MotorAutomaticConfig{};
    if (payloadJson == nullptr || payloadJson[0] == '\0') {
        return false;
    }

    JsonDocument doc;
    const DeserializationError err = deserializeJson(doc, payloadJson);
    if (err) {
        return false;
    }

    JsonObjectConst root = doc.as<JsonObjectConst>();
    const char* mode = root["automaticMode"] | "";
    if (strcmp(mode, "periodic") != 0) {
        Serial.println(F("[MOTOR-AUTO] reject: only periodic mode in v1"));
        return false;
    }

    MotorAutomaticConfig config{};
    config.minimumDutyPercent = root["minimumDutyPercent"] | 0;
    config.maximumDutyPercent = root["maximumDutyPercent"] | 80;
    config.segmentMinSeconds = root["segmentMinSeconds"] | 5;
    config.segmentMaxSeconds = root["segmentMaxSeconds"] | 20;
    config.delayBeforeStartSeconds = root["delayBeforeStartSeconds"] | 0;
    config.rampMs = root["rampMs"] | 500;
    config.endSessionValue = root["endSessionValue"] | 0;

    const char* endMode = root["endSessionMode"] | "noAutoEnd";
    if (strcmp(endMode, "minutes") == 0) {
        config.endSessionMode = MotorEndSessionMode::Minutes;
    } else if (strcmp(endMode, "noAutoEnd") == 0) {
        config.endSessionMode = MotorEndSessionMode::NoAutoEnd;
    } else {
        Serial.println(F("[MOTOR-AUTO] reject: endSessionMode must be minutes or noAutoEnd"));
        return false;
    }

    if (config.minimumDutyPercent < 0 || config.minimumDutyPercent > 100 ||
        config.maximumDutyPercent < 0 || config.maximumDutyPercent > 100) {
        return false;
    }
    if (config.minimumDutyPercent > config.maximumDutyPercent) {
        const int tmp = config.minimumDutyPercent;
        config.minimumDutyPercent = config.maximumDutyPercent;
        config.maximumDutyPercent = tmp;
    }

    if (config.segmentMinSeconds < 1 || config.segmentMaxSeconds < 1) {
        Serial.println(F("[MOTOR-AUTO] reject: segment seconds must be >= 1"));
        return false;
    }
    if (config.segmentMinSeconds > config.segmentMaxSeconds) {
        const int tmp = config.segmentMinSeconds;
        config.segmentMinSeconds = config.segmentMaxSeconds;
        config.segmentMaxSeconds = tmp;
    }

    if (config.delayBeforeStartSeconds < 0) {
        config.delayBeforeStartSeconds = 0;
    }
    if (config.endSessionValue < 0) {
        config.endSessionValue = 0;
    }
    if (config.rampMs < 0) {
        config.rampMs = 0;
    }

    if (config.endSessionMode == MotorEndSessionMode::Minutes && config.endSessionValue <= 0) {
        Serial.println(F("[MOTOR-AUTO] reject: minutes end mode requires endSessionValue"));
        return false;
    }

    config.valid = true;
    *outConfig = config;
    return true;
}
