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
    /** Restart AsyncWebServer when STA health probe finds no GET activity (Phase 12 P12-D4). */
    void rebindListenState();
    void noteFirstGet();

private:
    DeviceBootMode mode_ = DeviceBootMode::Running;
    NvsStore* nvsStore_ = nullptr;
    DeviceIdentity* identity_ = nullptr;
    WifiManager* wifi_ = nullptr;
    SignalRClient* signalR_ = nullptr;
    bool started_ = false;
    /** millis() when STA last gained IP; 0 when disconnected. */
    unsigned long staIpSinceMs_ = 0;
    /** millis() when HTTP server last started; 0 when not listening. */
    unsigned long httpStartedMs_ = 0;
    /** millis() of first GET after last start; 0 until a GET is served. */
    unsigned long httpFirstGetMs_ = 0;
    unsigned healthRebindCount_ = 0;
};
