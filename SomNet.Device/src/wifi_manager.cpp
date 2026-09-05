#include "wifi_manager.h"

#include "config.h"

#include <Arduino.h>
#include <time.h>

void WifiManager::beginStation(const char* ssid, const char* password) {
    softApMode_ = false;
    loggedConfigUi_ = false;
    strncpy(ssid_, ssid != nullptr ? ssid : "", sizeof(ssid_) - 1);
    strncpy(password_, password != nullptr ? password : "", sizeof(password_) - 1);
    ssid_[sizeof(ssid_) - 1] = '\0';
    password_[sizeof(password_) - 1] = '\0';
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(false);
    state_ = WifiConnectionState::Disconnected;
    retryDelayMs_ = WIFI_RETRY_BASE_MS;
    nextRetryMs_ = millis();
    loggedConnected_ = false;
    connectFailures_ = 0;
    resetTimeSync();
}

void WifiManager::beginSoftAp(const char* apSsid) {
    softApMode_ = true;
    loggedConfigUi_ = false;
    ssid_[0] = '\0';
    password_[0] = '\0';

    WiFi.mode(WIFI_AP);
    WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
    const bool started = WiFi.softAP(apSsid);
    state_ = started ? WifiConnectionState::Connected : WifiConnectionState::Disconnected;
    loggedConnected_ = false;

    Serial.print(F("[WIFI] Soft-AP "));
    Serial.print(apSsid);
    Serial.print(F(" IP="));
    Serial.println(WiFi.softAPIP());
    Serial.println(F("[HTTP] Config UI: http://192.168.4.1/"));
}

void WifiManager::poll() {
    if (softApMode_) {
        return;
    }

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
    if (softApMode_) {
        const IPAddress ip = WiFi.softAPIP();
        strncpy(buffer, ip.toString().c_str(), sizeof(buffer) - 1);
        buffer[sizeof(buffer) - 1] = '\0';
        return buffer;
    }
    if (!isConnected()) {
        return buffer;
    }

    const IPAddress ip = WiFi.localIP();
    strncpy(buffer, ip.toString().c_str(), sizeof(buffer) - 1);
    buffer[sizeof(buffer) - 1] = '\0';
    return buffer;
}

const char* WifiManager::configuredSsid() const {
    return ssid_;
}

int WifiManager::rssi() const {
    if (softApMode_ || !isConnected()) {
        return 0;
    }
    return WiFi.RSSI();
}

void WifiManager::startConnect() {
    if (ssid_[0] == '\0') {
        Serial.println(F("[WIFI] no SSID configured — use /config or secrets.ini"));
        nextRetryMs_ = millis() + retryDelayMs_;
        return;
    }

    Serial.print(F("[WIFI] connecting to "));
    Serial.println(ssid_);
    WiFi.mode(WIFI_STA);
    WiFi.disconnect(true);
    WiFi.begin(ssid_, password_);
    connectStartedMs_ = millis();
    state_ = WifiConnectionState::Connecting;
    loggedConnected_ = false;
    loggedConfigUi_ = false;
}

const char* wifiStatusLabel(wl_status_t status) {
    switch (status) {
    case WL_IDLE_STATUS:
        return "idle";
    case WL_NO_SSID_AVAIL:
        return "no_ssid";
    case WL_SCAN_COMPLETED:
        return "scan_done";
    case WL_CONNECTED:
        return "connected";
    case WL_CONNECT_FAILED:
        return "connect_failed";
    case WL_CONNECTION_LOST:
        return "lost";
    case WL_DISCONNECTED:
        return "disconnected";
    default:
        return "unknown";
    }
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
        connectFailures_ = 0;
        logConnectedOnce();
        return;
    }

    if (millis() - connectStartedMs_ >= WIFI_CONNECT_TIMEOUT_MS) {
        Serial.print(F("[WIFI] connect timeout, status="));
        Serial.print(static_cast<int>(status));
        Serial.print(F(" ("));
        Serial.print(wifiStatusLabel(status));
        Serial.println(F(")"));
        WiFi.disconnect(true);
        state_ = WifiConnectionState::Disconnected;
        ++connectFailures_;
        retryDelayMs_ = min(retryDelayMs_ * 2, WIFI_RETRY_MAX_MS);
        nextRetryMs_ = millis() + retryDelayMs_;
        Serial.print(F("[WIFI] retry in "));
        Serial.print(retryDelayMs_ / 1000);
        Serial.println(F(" s"));
    }
}

void WifiManager::handleConnected() {
    pollTimeSync();

    if (WiFi.status() == WL_CONNECTED) {
        return;
    }

    Serial.println(F("[WIFI] link lost, reconnecting"));
    state_ = WifiConnectionState::Disconnected;
    loggedConnected_ = false;
    loggedConfigUi_ = false;
    resetTimeSync();
    nextRetryMs_ = millis() + WIFI_RETRY_BASE_MS;
}

void WifiManager::logConnectedOnce() {
    if (loggedConnected_) {
        return;
    }
    loggedConnected_ = true;
    Serial.print(F("[WIFI] connected IP="));
    Serial.print(WiFi.localIP());
    Serial.print(F(" gateway="));
    Serial.print(WiFi.gatewayIP());
    Serial.print(F(" RSSI="));
    Serial.println(WiFi.RSSI());

    if (!loggedConfigUi_) {
        loggedConfigUi_ = true;
        Serial.print(F("[HTTP] Config UI: http://"));
        Serial.print(WiFi.localIP());
        Serial.println('/');
    }

    startSntpIfNeeded();
}

void WifiManager::resetTimeSync() {
    sntpStarted_ = false;
    timeSynced_ = false;
    sntpStartedMs_ = 0;
}

void WifiManager::startSntpIfNeeded() {
    if (sntpStarted_ || softApMode_) {
        return;
    }

    sntpStarted_ = true;
    sntpStartedMs_ = millis();
    setenv("TZ", "UTC0", 1);
    tzset();
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    Serial.println(F("[TIME] SNTP sync started"));
}

void WifiManager::pollTimeSync() {
    if (timeSynced_ || !sntpStarted_) {
        return;
    }

    const time_t now = time(nullptr);
    if (now >= 1700000000) {
        timeSynced_ = true;
        struct tm timeinfo = {};
        gmtime_r(&now, &timeinfo);
        Serial.print(F("[TIME] synced UTC "));
        Serial.print(timeinfo.tm_year + 1900);
        Serial.print('-');
        if (timeinfo.tm_mon + 1 < 10) {
            Serial.print('0');
        }
        Serial.print(timeinfo.tm_mon + 1);
        Serial.print('-');
        if (timeinfo.tm_mday < 10) {
            Serial.print('0');
        }
        Serial.println(timeinfo.tm_mday);
        return;
    }

    if (millis() - sntpStartedMs_ >= SNTP_SYNC_TIMEOUT_MS) {
        Serial.println(F("[TIME] SNTP sync timeout — expiry check deferred to hub type-7"));
    }
}
