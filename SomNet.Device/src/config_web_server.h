#pragma once

#include "device_mode.h"

class DeviceIdentity;
class NvsStore;
class WifiManager;

class ConfigWebServer {
public:
    bool begin(DeviceBootMode mode, NvsStore* nvsStore, DeviceIdentity* identity, WifiManager* wifi);
    void poll();
    void setBootMode(DeviceBootMode mode);

private:
    DeviceBootMode mode_ = DeviceBootMode::Running;
    NvsStore* nvsStore_ = nullptr;
    DeviceIdentity* identity_ = nullptr;
    WifiManager* wifi_ = nullptr;
    bool started_ = false;
};
