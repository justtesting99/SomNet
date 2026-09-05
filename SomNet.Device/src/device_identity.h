#pragma once

#include <stddef.h>
#include <stdint.h>

class NvsStore;

class DeviceIdentity {
public:
    void begin(NvsStore& nvsStore);
    const char* deviceId() const;
    const char* macAddress() const;

private:
    static bool isValidDeviceId(const char* id);
    static void formatDeviceIdFromMac(const uint8_t mac[6], char* out, size_t outLen);
    static void formatMacAddress(const uint8_t mac[6], char* out, size_t outLen);

    char deviceId_[32] = "esp32-UNPROVISIONED";
    char macAddress_[18] = "00:00:00:00:00:00";
    bool ready_ = false;
};
