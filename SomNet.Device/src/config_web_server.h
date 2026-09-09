#pragma once

#include "device_mode.h"

class DeviceIdentity;
class NvsStore;
class SignalRClient;
class WifiManager;

class ConfigWebServer {
public:
    bool begin(
        DeviceBootMode mode,
        NvsStore* nvsStore,
        DeviceIdentity* identity,
        WifiManager* wifi,
        SignalRClient* signalRClient = nullptr);
    void poll();
    void setBootMode(DeviceBootMode mode);
    /** Call when switching STA ↔ setup AP so HTTP can bind on the new interface. */
    void resetListenState();

private:
    DeviceBootMode mode_ = DeviceBootMode::Running;
    NvsStore* nvsStore_ = nullptr;
    DeviceIdentity* identity_ = nullptr;
    WifiManager* wifi_ = nullptr;
    SignalRClient* signalR_ = nullptr;
    bool started_ = false;
    /** millis() when STA last gained IP; 0 when disconnected. */
    unsigned long staIpSinceMs_ = 0;
};
