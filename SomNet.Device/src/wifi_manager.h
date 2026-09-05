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
    void beginStation(const char* ssid, const char* password);
    void beginSoftAp(const char* apSsid);
    void poll();

    bool isSoftAp() const { return softApMode_; }
    WifiConnectionState state() const { return state_; }
    bool isConnected() const { return state_ == WifiConnectionState::Connected; }
    const char* localIp() const;
    const char* configuredSsid() const;
    int rssi() const;
    unsigned connectFailureCount() const { return connectFailures_; }
    bool isTimeSynced() const { return timeSynced_; }

private:
    void startConnect();
    void handleDisconnected();
    void handleConnecting();
    void handleConnected();
    void logConnectedOnce();
    void startSntpIfNeeded();
    void pollTimeSync();
    void resetTimeSync();

    char ssid_[33] = {};
    char password_[65] = {};
    bool softApMode_ = false;
    WifiConnectionState state_ = WifiConnectionState::Disconnected;
    unsigned long connectStartedMs_ = 0;
    unsigned long nextRetryMs_ = 0;
    unsigned long retryDelayMs_ = WIFI_RETRY_BASE_MS;
    bool loggedConnected_ = false;
    bool loggedConfigUi_ = false;
    unsigned connectFailures_ = 0;
    bool sntpStarted_ = false;
    bool timeSynced_ = false;
    unsigned long sntpStartedMs_ = 0;
};
