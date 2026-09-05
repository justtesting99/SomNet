#include "wifi_manager.h"

#include "config.h"

#include <Arduino.h>

void WifiManager::begin(const char* ssid, const char* password) {
    ssid_ = ssid != nullptr ? ssid : "";
    password_ = password != nullptr ? password : "";
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(false);
    state_ = WifiConnectionState::Disconnected;
    retryDelayMs_ = WIFI_RETRY_BASE_MS;
    nextRetryMs_ = millis();
    loggedConnected_ = false;
}

void WifiManager::poll() {
    switch (state_) {
    case WifiConnectionState::Disconnected:
        handleDisconnected();
        break;
    case WifiConnectionState::Connecting:
        handleConnecting();
        break;
    case WifiConnectionState::Connected:
        handleConnected();
        break;
    }
}

const char* WifiManager::localIp() const {
    static char buffer[16] = "0.0.0.0";
    if (!isConnected()) {
        return buffer;
    }
    strncpy(buffer, WiFi.localIP().toString().c_str(), sizeof(buffer) - 1);
    buffer[sizeof(buffer) - 1] = '\0';
    return buffer;
}

int WifiManager::rssi() const {
    return isConnected() ? WiFi.RSSI() : 0;
}

void WifiManager::startConnect() {
    if (ssid_[0] == '\0') {
        Serial.println(F("[WIFI] no SSID configured — copy secrets.ini.example to secrets.ini"));
        nextRetryMs_ = millis() + retryDelayMs_;
        return;
    }

    Serial.print(F("[WIFI] connecting to "));
    Serial.println(ssid_);
    WiFi.disconnect(true);
    WiFi.begin(ssid_, password_);
    connectStartedMs_ = millis();
    state_ = WifiConnectionState::Connecting;
    loggedConnected_ = false;
}

void WifiManager::handleDisconnected() {
    if (millis() < nextRetryMs_) {
        return;
    }
    startConnect();
}

void WifiManager::handleConnecting() {
    const wl_status_t status = WiFi.status();
    if (status == WL_CONNECTED) {
        state_ = WifiConnectionState::Connected;
        retryDelayMs_ = WIFI_RETRY_BASE_MS;
        logConnectedOnce();
        return;
    }

    if (millis() - connectStartedMs_ >= WIFI_CONNECT_TIMEOUT_MS) {
        Serial.print(F("[WIFI] connect timeout, status="));
        Serial.println(static_cast<int>(status));
        WiFi.disconnect(true);
        state_ = WifiConnectionState::Disconnected;
        retryDelayMs_ = min(retryDelayMs_ * 2, WIFI_RETRY_MAX_MS);
        nextRetryMs_ = millis() + retryDelayMs_;
        Serial.print(F("[WIFI] retry in "));
        Serial.print(retryDelayMs_ / 1000);
        Serial.println(F(" s"));
    }
}

void WifiManager::handleConnected() {
    if (WiFi.status() == WL_CONNECTED) {
        return;
    }

    Serial.println(F("[WIFI] link lost, reconnecting"));
    state_ = WifiConnectionState::Disconnected;
    loggedConnected_ = false;
    nextRetryMs_ = millis() + WIFI_RETRY_BASE_MS;
}

void WifiManager::logConnectedOnce() {
    if (loggedConnected_) {
        return;
    }
    loggedConnected_ = true;
    Serial.print(F("[WIFI] connected IP="));
    Serial.print(WiFi.localIP());
    Serial.print(F(" RSSI="));
    Serial.println(WiFi.RSSI());
}
