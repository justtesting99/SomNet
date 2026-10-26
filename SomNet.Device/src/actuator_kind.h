#pragma once

#include <stddef.h>
#include <stdint.h>

enum DeviceActuatorKind : uint8_t {
    DeviceActuatorKind_Relay = 0,
    DeviceActuatorKind_HBridge = 1,
};

/** JSON / API value: "relay" | "hbridge". */
const char* actuatorKindToJson(DeviceActuatorKind kind);

/** Returns false if string is not relay or hbridge. */
bool actuatorKindFromJson(const char* value, DeviceActuatorKind* out);
