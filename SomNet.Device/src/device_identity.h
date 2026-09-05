#pragma once

class DeviceIdentity {
public:
    void begin();
    const char* deviceId() const;

private:
    char deviceId_[32] = "esp32-UNPROVISIONED";
};
