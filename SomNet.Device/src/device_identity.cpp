#include "device_identity.h"

void DeviceIdentity::begin() {
    // Phase 2: read MAC, format esp32-{12HEX}, persist to NVS
}

const char* DeviceIdentity::deviceId() const {
    return deviceId_;
}
