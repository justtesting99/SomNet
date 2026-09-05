#include "signalr_client.h"

#include <Arduino.h>

void SignalRClient::begin() {
    // Phase 4: negotiate, WebSocket, PairDevice, ExecuteCommand
    initialized_ = true;
}

void SignalRClient::poll() {
}
