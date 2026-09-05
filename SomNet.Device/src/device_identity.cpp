#include "device_identity.h"

#include "nvs_store.h"

#include <esp_mac.h>
#include <stdio.h>
#include <string.h>

#include <Arduino.h>

namespace {

constexpr char kDeviceIdPrefix[] = "esp32-";
constexpr size_t kExpectedDeviceIdLen = 18; // "esp32-" + 12 hex

bool readStaMac(uint8_t mac[6]) {
    return esp_read_mac(mac, ESP_MAC_WIFI_STA) == ESP_OK;
}

} // namespace

void DeviceIdentity::formatDeviceIdFromMac(const uint8_t mac[6], char* out, size_t outLen) {
    if (outLen < kExpectedDeviceIdLen + 1) {
        if (outLen > 0) {
            out[0] = '\0';
        }
        return;
    }

    snprintf(
        out,
        outLen,
        "%s%02X%02X%02X%02X%02X%02X",
        kDeviceIdPrefix,
        mac[0],
        mac[1],
        mac[2],
        mac[3],
        mac[4],
        mac[5]);
}

void DeviceIdentity::formatMacAddress(const uint8_t mac[6], char* out, size_t outLen) {
    if (outLen < 18) {
        if (outLen > 0) {
            out[0] = '\0';
        }
        return;
    }

    snprintf(
        out,
        outLen,
        "%02X:%02X:%02X:%02X:%02X:%02X",
        mac[0],
        mac[1],
        mac[2],
        mac[3],
        mac[4],
        mac[5]);
}

bool DeviceIdentity::isValidDeviceId(const char* id) {
    if (id == nullptr) {
        return false;
    }

    if (strncmp(id, kDeviceIdPrefix, strlen(kDeviceIdPrefix)) != 0) {
        return false;
    }

    if (strlen(id) != kExpectedDeviceIdLen) {
        return false;
    }

    for (size_t i = strlen(kDeviceIdPrefix); i < kExpectedDeviceIdLen; ++i) {
        const char c = id[i];
        const bool hex = (c >= '0' && c <= '9') || (c >= 'A' && c <= 'F');
        if (!hex) {
            return false;
        }
    }

    return true;
}

void DeviceIdentity::begin(NvsStore& nvsStore) {
    uint8_t mac[6] = {};
    if (!readStaMac(mac)) {
        Serial.println(F("[ID] failed to read MAC"));
        return;
    }

    formatMacAddress(mac, macAddress_, sizeof(macAddress_));

    char expectedId[NvsStore::kDeviceIdLen] = {};
    formatDeviceIdFromMac(mac, expectedId, sizeof(expectedId));

    char storedId[NvsStore::kDeviceIdLen] = {};
    const bool hasStored = nvsStore.getDeviceId(storedId, sizeof(storedId));

    if (hasStored && isValidDeviceId(storedId) && strcmp(storedId, expectedId) == 0) {
        strncpy(deviceId_, storedId, sizeof(deviceId_) - 1);
        deviceId_[sizeof(deviceId_) - 1] = '\0';
        Serial.print(F("[ID] loaded device_id="));
        Serial.println(deviceId_);
    } else {
        strncpy(deviceId_, expectedId, sizeof(deviceId_) - 1);
        deviceId_[sizeof(deviceId_) - 1] = '\0';
        if (nvsStore.setDeviceId(deviceId_)) {
            Serial.print(F("[ID] saved device_id="));
            Serial.println(deviceId_);
        } else {
            Serial.println(F("[ID] warning: could not persist device_id to NVS"));
        }
    }

    ready_ = true;
}

const char* DeviceIdentity::deviceId() const {
    return deviceId_;
}

const char* DeviceIdentity::macAddress() const {
    return macAddress_;
}
