#pragma once

#include "config.h"

#include <IPAddress.h>
#include <stddef.h>
#include <stdint.h>

class DeviceIdentity;
class NvsStore;
class WifiManager;

enum class HubConnectionState {
    Offline,
    Backoff,
    Negotiating,
    Connecting,
    Handshaking,
    Unpaired,
    Paired,
};

class SignalRClient {
public:
    bool begin(NvsStore* nvsStore, DeviceIdentity* identity, WifiManager* wifi);
    void poll();

    HubConnectionState hubState() const { return state_; }
    const char* hubStateLabel() const;
    bool isHubConnected() const;
    bool sendAckCommand(
        const char* correlationId,
        bool success,
        const char* message,
        const char* resultJson = nullptr);

    void onTransportLost(bool immediateRetry = false);
    void markHandshakeComplete();
    void clearHandshakeState();

    void onWifiLinkRestored();
    void recoverStalledConnection();
    void recoverNetworkTransport();
    void onNegotiateTransportError();
    void clearTransportFailures();

private:
    void beginArpWarm(const IPAddress& target);
    bool pollArpWarm();
    NvsStore* nvs_ = nullptr;
    DeviceIdentity* identity_ = nullptr;
    WifiManager* wifi_ = nullptr;
    HubConnectionState state_ = HubConnectionState::Offline;
    unsigned long nextAttemptMs_ = 0;
    unsigned long backoffMs_ = HUB_RETRY_BASE_MS;
    bool initialized_ = false;
    bool handshakeComplete_ = false;
    bool pendingConnect_ = false;
    unsigned long wifiLinkUpMs_ = 0;
    unsigned long lastStallRecoveryMs_ = 0;
    unsigned long hubBootSettleMs_ = HUB_BOOT_SETTLE_MS;
    unsigned consecutiveTransportFailures_ = 0;
    bool transportRecoveryUsed_ = false;
    IPAddress arpWarmTarget_;
    bool arpWarmActive_ = false;
    unsigned long arpWarmStartedMs_ = 0;
    unsigned long lastArpPokeMs_ = 0;
};
