#pragma once

#include "config.h"

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

    void onTransportLost(bool immediateRetry = false);

private:
    NvsStore* nvs_ = nullptr;
    DeviceIdentity* identity_ = nullptr;
    WifiManager* wifi_ = nullptr;
    HubConnectionState state_ = HubConnectionState::Offline;
    unsigned long nextAttemptMs_ = 0;
    unsigned long backoffMs_ = HUB_RETRY_BASE_MS;
    bool initialized_ = false;
    bool handshakeComplete_ = false;
    bool pendingConnect_ = false;
};
