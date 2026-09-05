#pragma once

#include "config.h"

#include <WiFi.h>

enum class WifiConnectionState {
    Disconnected,
    Connecting,
    Connected,
};

class WifiManager {
public:
    void begin(const char* ssid, const char* password);
    void poll();

    WifiConnectionState state() const { return state_; }
    bool isConnected() const { return state_ == WifiConnectionState::Connected; }
    const char* localIp() const;
    int rssi() const;

private:
    void startConnect();
    void handleDisconnected();
    void handleConnecting();
    void handleConnected();
    void logConnectedOnce();

    const char* ssid_ = "";
    const char* password_ = "";
    WifiConnectionState state_ = WifiConnectionState::Disconnected;
    unsigned long connectStartedMs_ = 0;
    unsigned long nextRetryMs_ = 0;
    unsigned long retryDelayMs_ = WIFI_RETRY_BASE_MS;
    bool loggedConnected_ = false;
};
