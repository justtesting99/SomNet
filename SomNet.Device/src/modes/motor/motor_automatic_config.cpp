#include "modes/motor/motor_automatic_config.h"

#include "modes/motor/motor_automatic_burst.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <esp_random.h>
#include <string.h>

namespace {

constexpr unsigned long kMsPerMinute = 60UL * 1000UL;
constexpr int kWaveSteps = 20;

int clampInt(int value, int minValue, int maxValue) {
    if (value < minValue) {
        return minValue;
    }
    if (value > maxValue) {
        return maxValue;
    }
    return value;
}

} // namespace

int motorEndSessionModeToWire(MotorEndSessionMode mode) {
    return mode == MotorEndSessionMode::Minutes ? 1 : 0;
}

MotorAutomaticRunMode parseMotorAutomaticRunMode(const char* value) {
    if (value == nullptr || value[0] == '\0') {
        return MotorAutomaticRunMode::Unknown;
    }

    if (strcmp(value, "periodic") == 0) {
        return MotorAutomaticRunMode::Periodic;
    }
    if (strcmp(value, "randomSpeed") == 0 || strcmp(value, "randomPowerOnly") == 0) {
        return MotorAutomaticRunMode::RandomSpeed;
    }
    if (strcmp(value, "randomSpeedAndTiming") == 0 || strcmp(value, "randomPowerAndTiming") == 0) {
        return MotorAutomaticRunMode::RandomSpeedAndTiming;
    }
    if (strcmp(value, "powerWave") == 0) {
        return MotorAutomaticRunMode::PowerWave;
    }
    if (strcmp(value, "buildUp") == 0) {
        return MotorAutomaticRunMode::BuildUp;
    }

    return MotorAutomaticRunMode::Unknown;
}

const char* motorAutomaticRunModeToWire(MotorAutomaticRunMode mode) {
    switch (mode) {
        case MotorAutomaticRunMode::Periodic:
            return "periodic";
        case MotorAutomaticRunMode::RandomSpeed:
            return "randomSpeed";
        case MotorAutomaticRunMode::RandomSpeedAndTiming:
            return "randomSpeedAndTiming";
        case MotorAutomaticRunMode::PowerWave:
            return "powerWave";
        case MotorAutomaticRunMode::BuildUp:
            return "buildUp";
        case MotorAutomaticRunMode::Unknown:
        default:
            return "unknown";
    }
}

int motorSpeedPercentToDuty(int speedPercent, const MotorAutomaticConfig& config) {
    const int speed = clampInt(speedPercent, 0, 100);
    const int minDuty = config.minimumDutyPercent;
    const int maxDuty = config.maximumDutyPercent;
    if (maxDuty <= minDuty) {
        return maxDuty;
    }

    return minDuty + (maxDuty - minDuty) * speed / 100;
}

int motorDutyPercentToSpeedPercent(int dutyPercent, const MotorAutomaticConfig& config) {
    const int duty = clampInt(dutyPercent, 0, 100);
    const int minDuty = config.minimumDutyPercent;
    const int maxDuty = config.maximumDutyPercent;
    if (maxDuty <= minDuty) {
        return 100;
    }

    return clampInt((duty - minDuty) * 100 / (maxDuty - minDuty), 0, 100);
}

int motorResolveBurstDutyPercent(int burstRelativePower, const MotorAutomaticConfig& config) {
    int relative = burstRelativePower;
    if (relative < 0) {
        relative = 0;
    }
    if (relative > 100) {
        relative = 100;
    }

    const int minDuty = config.minimumDutyPercent;
    const int maxDuty = config.maximumDutyPercent;
    if (maxDuty <= minDuty) {
        return maxDuty;
    }

    return minDuty + (maxDuty - minDuty) * relative / 100;
}

int motorResolveSpeedPercentForSegment(
    const MotorAutomaticConfig& config,
    int segmentIndex,
    unsigned long sessionStartMs,
    unsigned long nowMs) {
    const int minSpeed = config.minimumSpeedPercent;
    const int maxSpeed = config.maximumSpeedPercent;
    const int lo = minSpeed < maxSpeed ? minSpeed : maxSpeed;
    const int hi = minSpeed < maxSpeed ? maxSpeed : minSpeed;

    switch (config.mode) {
        case MotorAutomaticRunMode::Periodic:
            return hi;
        case MotorAutomaticRunMode::RandomSpeed:
        case MotorAutomaticRunMode::RandomSpeedAndTiming: {
            if (lo >= hi) {
                return hi;
            }
            const int span = hi - lo + 1;
            return lo + static_cast<int>(esp_random() % static_cast<uint32_t>(span));
        }
        case MotorAutomaticRunMode::PowerWave: {
            const int step = segmentIndex % kWaveSteps;
            const int half = kWaveSteps / 2;
            const int tri = step < half ? step : (kWaveSteps - step);
            const int span = hi - lo;
            return lo + (tri * span) / half;
        }
        case MotorAutomaticRunMode::BuildUp: {
            float progress = 0.0f;
            if (config.endSessionMode == MotorEndSessionMode::Minutes && config.endSessionValue > 0 &&
                sessionStartMs > 0) {
                const unsigned long elapsedMs = nowMs - sessionStartMs;
                const unsigned long targetMs =
                    static_cast<unsigned long>(config.endSessionValue) * kMsPerMinute;
                if (targetMs > 0) {
                    progress = static_cast<float>(elapsedMs) / static_cast<float>(targetMs);
                }
            } else if (segmentIndex > 0) {
                progress = static_cast<float>(segmentIndex) / static_cast<float>(segmentIndex + 10);
            }
            if (progress < 0.0f) {
                progress = 0.0f;
            }
            if (progress > 1.0f) {
                progress = 1.0f;
            }
            return lo + static_cast<int>(progress * static_cast<float>(hi - lo));
        }
        default:
            return hi;
    }
}

bool parseMotorAutomaticConfig(const char* payloadJson, MotorAutomaticConfig* outConfig) {
    if (outConfig == nullptr) {
        return false;
    }

    *outConfig = MotorAutomaticConfig{};
    if (payloadJson == nullptr || payloadJson[0] == '\0') {
        return false;
    }

    StaticJsonDocument<1024> doc;
    const DeserializationError err = deserializeJson(doc, payloadJson);
    if (err) {
        return false;
    }

    JsonObjectConst root = doc.as<JsonObjectConst>();
    const char* mode = root["automaticMode"] | "";
    const MotorAutomaticRunMode parsedMode = parseMotorAutomaticRunMode(mode);
    if (parsedMode == MotorAutomaticRunMode::Unknown) {
        Serial.println(F("[MOTOR-AUTO] reject: unsupported automaticMode"));
        return false;
    }

    MotorAutomaticConfig config{};
    config.mode = parsedMode;
    config.minimumDutyPercent = root["minimumDutyPercent"] | 0;
    config.maximumDutyPercent = root["maximumDutyPercent"] | 80;
    config.minimumSpeedPercent = root["minimumSpeedPercent"] | 0;
    config.maximumSpeedPercent = root["maximumSpeedPercent"] | 100;
    config.segmentMinSeconds = root["segmentMinSeconds"] | 5;
    config.segmentMaxSeconds = root["segmentMaxSeconds"] | 20;
    config.delayBeforeStartSeconds = root["delayBeforeStartSeconds"] | 0;
    config.rampMs = root["rampMs"] | 500;
    if (doc["segmentTargetRampMs"].is<int>() || doc["segmentTargetRampMs"].is<long>()) {
        config.segmentTargetRampMs = doc["segmentTargetRampMs"].as<int>();
    } else {
        config.segmentTargetRampMs = -1;
    }
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

    if (config.minimumSpeedPercent < 0 || config.minimumSpeedPercent > 100 ||
        config.maximumSpeedPercent < 0 || config.maximumSpeedPercent > 100) {
        return false;
    }
    if (config.minimumSpeedPercent > config.maximumSpeedPercent) {
        const int tmp = config.minimumSpeedPercent;
        config.minimumSpeedPercent = config.maximumSpeedPercent;
        config.maximumSpeedPercent = tmp;
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
    if (config.segmentTargetRampMs < -1 || config.segmentTargetRampMs > 30000) {
        Serial.println(F("[MOTOR-AUTO] reject: segmentTargetRampMs out of range"));
        return false;
    }

    if (config.endSessionMode == MotorEndSessionMode::Minutes && config.endSessionValue <= 0) {
        Serial.println(F("[MOTOR-AUTO] reject: minutes end mode requires endSessionValue"));
        return false;
    }

    if (doc["burstsOn"].is<bool>()) {
        config.burstsOn = doc["burstsOn"].as<bool>();
    } else if (doc["burstsOn"].is<int>()) {
        config.burstsOn = doc["burstsOn"].as<int>() != 0;
    } else {
        config.burstsOn = false;
    }

    if (doc["burstPlacement"].is<const char*>()) {
        config.burstPlacement = parseBurstPlacement(doc["burstPlacement"].as<const char*>());
        if (config.burstPlacement == BurstPlacement::Unknown) {
            Serial.println(F("[MOTOR-AUTO] reject: unknown burstPlacement"));
            return false;
        }
    } else {
        config.burstPlacement = BurstPlacement::SessionSpread;
    }

    config.burstPercent = doc["burstPercent"] | 10;
    if (doc["burstStyle"].is<const char*>()) {
        config.burstStyle = parseBurstStyle(doc["burstStyle"].as<const char*>());
        if (config.burstStyle == BurstStyle::Unknown) {
            Serial.println(F("[MOTOR-AUTO] reject: unknown burstStyle"));
            return false;
        }
    } else {
        config.burstStyle = BurstStyle::FixedPowerDelay;
    }

    config.burstStrokePowerMin = doc["burstStrokePowerMin"] | 0;
    config.burstStrokePowerMax = doc["burstStrokePowerMax"] | 100;
    config.burstDelayMin = doc["burstDelayMin"] | 1;
    config.burstDelayMax = doc["burstDelayMax"] | 5;
    config.burstStrokesMin = doc["burstStrokesMin"] | 5;
    config.burstStrokesMax = doc["burstStrokesMax"] | 10;

    if (config.burstPercent < 0 || config.burstPercent > 100) {
        Serial.println(F("[MOTOR-AUTO] reject: burstPercent out of range"));
        return false;
    }

    if (config.burstStrokePowerMin > config.burstStrokePowerMax) {
        const int tmp = config.burstStrokePowerMin;
        config.burstStrokePowerMin = config.burstStrokePowerMax;
        config.burstStrokePowerMax = tmp;
    }

    if (config.burstDelayMin > config.burstDelayMax) {
        const int tmp = config.burstDelayMin;
        config.burstDelayMin = config.burstDelayMax;
        config.burstDelayMax = tmp;
    }

    if (config.burstStrokesMin < 1 || config.burstStrokesMax < config.burstStrokesMin) {
        Serial.println(F("[MOTOR-AUTO] reject: burst stroke count range invalid"));
        return false;
    }

    if (config.burstsOn && !motorBurstSettingsAllowed(config)) {
        Serial.println(
            F("[MOTOR-AUTO] reject: periodic bursts require minutes end + session spread placement"));
        return false;
    }

    config.valid = true;
    *outConfig = config;
    return true;
}
