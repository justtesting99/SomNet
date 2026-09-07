#include "modes/automatic/automatic_config.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <string.h>

AutomaticRunMode parseAutomaticRunMode(const char* value) {
    if (value == nullptr || value[0] == '\0') {
        return AutomaticRunMode::Unknown;
    }

    if (strcmp(value, "periodic") == 0) {
        return AutomaticRunMode::Periodic;
    }
    if (strcmp(value, "randomPowerOnly") == 0) {
        return AutomaticRunMode::RandomPowerOnly;
    }
    if (strcmp(value, "randomTimingOnly") == 0) {
        return AutomaticRunMode::RandomTimingOnly;
    }
    if (strcmp(value, "randomPowerAndTiming") == 0) {
        return AutomaticRunMode::RandomPowerAndTiming;
    }
    if (strcmp(value, "powerWave") == 0) {
        return AutomaticRunMode::PowerWave;
    }
    if (strcmp(value, "powerAndTimingWave") == 0) {
        return AutomaticRunMode::PowerAndTimingWave;
    }
    if (strcmp(value, "buildUp") == 0) {
        return AutomaticRunMode::BuildUp;
    }

    return AutomaticRunMode::Unknown;
}

EndSessionMode parseEndSessionMode(const char* value) {
    if (value == nullptr || value[0] == '\0') {
        return EndSessionMode::Unknown;
    }

    if (strcmp(value, "minutes") == 0) {
        return EndSessionMode::Minutes;
    }
    if (strcmp(value, "strokes") == 0) {
        return EndSessionMode::Strokes;
    }
    if (strcmp(value, "noAutoEnd") == 0) {
        return EndSessionMode::NoAutoEnd;
    }

    return EndSessionMode::Unknown;
}

int clampPowerPercent(int value) {
    if (value < 0) {
        return 0;
    }
    if (value > 100) {
        return 100;
    }
    return value;
}

void normalizePowerRange(int* minimumPower, int* maximumPower) {
    if (minimumPower == nullptr || maximumPower == nullptr) {
        return;
    }

    *minimumPower = clampPowerPercent(*minimumPower);
    *maximumPower = clampPowerPercent(*maximumPower);

    if (*minimumPower > *maximumPower) {
        const int tmp = *minimumPower;
        *minimumPower = *maximumPower;
        *maximumPower = tmp;
    }
}

bool parseAutomaticConfig(const char* payloadJson, AutomaticConfig* outConfig) {
    if (outConfig == nullptr) {
        return false;
    }

    *outConfig = AutomaticConfig{};

    // Keep small — parsed on main loop; payload string may be up to 768 chars.
    StaticJsonDocument<384> doc;
    const DeserializationError err = deserializeJson(doc, payloadJson != nullptr ? payloadJson : "{}");
    if (err) {
        Serial.print(F("[AUTO] payload JSON error: "));
        Serial.println(err.c_str());
        return false;
    }

    if (!doc["automaticMode"].is<const char*>()) {
        Serial.println(F("[AUTO] reject: automaticMode required"));
        return false;
    }

    outConfig->mode = parseAutomaticRunMode(doc["automaticMode"].as<const char*>());
    if (outConfig->mode == AutomaticRunMode::Unknown) {
        Serial.println(F("[AUTO] reject: unknown automaticMode"));
        return false;
    }

    outConfig->minimumStrokeMs = doc["minimumStrokeMs"] | 25;
    outConfig->maximumStrokeMs = doc["maximumStrokeMs"] | 400;
    outConfig->minimumPower = doc["minimumPower"] | 0;
    outConfig->maximumPower = doc["maximumPower"] | 100;
    outConfig->strokeMinSeconds = doc["strokeMinSeconds"] | 0;
    outConfig->strokeMaxSeconds = doc["strokeMaxSeconds"] | 0;
    outConfig->delayBeforeStartSeconds = doc["delayBeforeStartSeconds"] | 0;
    outConfig->endSessionValue = doc["endSessionValue"] | 0;
    outConfig->burstsOn = doc["burstsOn"] | false;

    if (doc["endSessionMode"].is<const char*>()) {
        outConfig->endSessionMode = parseEndSessionMode(doc["endSessionMode"].as<const char*>());
    } else {
        outConfig->endSessionMode = EndSessionMode::NoAutoEnd;
    }

    if (outConfig->minimumStrokeMs > outConfig->maximumStrokeMs) {
        const int tmp = outConfig->minimumStrokeMs;
        outConfig->minimumStrokeMs = outConfig->maximumStrokeMs;
        outConfig->maximumStrokeMs = tmp;
    }

    normalizePowerRange(&outConfig->minimumPower, &outConfig->maximumPower);

    if (outConfig->strokeMinSeconds < 0) {
        outConfig->strokeMinSeconds = 0;
    }
    if (outConfig->strokeMaxSeconds < 0) {
        outConfig->strokeMaxSeconds = 0;
    }
    if (outConfig->delayBeforeStartSeconds < 0) {
        outConfig->delayBeforeStartSeconds = 0;
    }
    if (outConfig->endSessionValue < 0) {
        outConfig->endSessionValue = 0;
    }

    if (outConfig->burstsOn) {
        Serial.println(F("[AUTO] reject: burstsOn not supported (Part 3)"));
        return false;
    }

    outConfig->valid = true;
    return true;
}

int effectivePowerPercentForMode(const AutomaticConfig& config) {
    switch (config.mode) {
        case AutomaticRunMode::Periodic:
        case AutomaticRunMode::RandomTimingOnly:
            return config.maximumPower;
        default:
            return config.maximumPower;
    }
}

int effectiveGapSecondsForMode(const AutomaticConfig& config) {
    switch (config.mode) {
        case AutomaticRunMode::Periodic:
        case AutomaticRunMode::RandomPowerOnly:
        case AutomaticRunMode::PowerWave:
            return config.strokeMaxSeconds;
        default:
            return config.strokeMaxSeconds;
    }
}

bool isAutomaticStartKey(const char* commandKey) {
    return commandKey != nullptr &&
        (strcmp(commandKey, "automatic-start") == 0 || strcmp(commandKey, "automatic:start") == 0);
}

bool isAutomaticStopKey(const char* commandKey) {
    return commandKey != nullptr &&
        (strcmp(commandKey, "automatic-stop") == 0 || strcmp(commandKey, "automatic:stop") == 0);
}
