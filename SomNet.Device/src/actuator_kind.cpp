#include "actuator_kind.h"

#include <string.h>

const char* actuatorKindToJson(DeviceActuatorKind kind) {
    switch (kind) {
    case DeviceActuatorKind_HBridge:
        return "hbridge";
    case DeviceActuatorKind_Relay:
    default:
        return "relay";
    }
}

bool actuatorKindFromJson(const char* value, DeviceActuatorKind* out) {
    if (value == nullptr || out == nullptr) {
        return false;
    }

    if (strcmp(value, "hbridge") == 0) {
        *out = DeviceActuatorKind_HBridge;
        return true;
    }
    if (strcmp(value, "relay") == 0) {
        *out = DeviceActuatorKind_Relay;
        return true;
    }

    return false;
}
