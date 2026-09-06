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
    /** True while SNTP is in progress (paired hub may wait briefly). False after sync or timeout. */
    bool isTimeSyncPending() const;
    /** One-shot: true once after each successful Wi-Fi association (STA). */
    bool takeLinkRestored();
    /** Disconnect and re-associate STA (transport recovery after repeated hub failures). */
    void refreshAssociation();
    /** Send one lwIP ARP request (non-blocking). */
    void pokeHostArp(const IPAddress& host);
    /** True when the STA netif has a cached ARP entry for host. */
    bool isHostArpResolved(const IPAddress& host) const;
    /** Brief blocking warm (~1 s max); prefer poke + pollArpWarm in hub FSM. */
    bool resolveHostArp(const IPAddress& host);

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
    bool sntpTimedOut_ = false;
    bool linkJustRestored_ = false;
    unsigned long sntpStartedMs_ = 0;
};
