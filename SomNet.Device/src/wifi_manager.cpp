#include "wifi_manager.h"

#include "config.h"

#include <Arduino.h>
#include <time.h>

extern "C" {
#include "lwip/etharp.h"
#include "lwip/ip4_addr.h"
#include "lwip/netif.h"
}

extern struct netif* netif_list;

namespace {

struct netif* findStaNetif() {
    const IPAddress local = WiFi.localIP();
    if (local == IPAddress(0, 0, 0, 0)) {
        return nullptr;
    }

    const uint32_t localAddr = static_cast<uint32_t>(local);
    for (struct netif* netif = netif_list; netif != nullptr; netif = netif->next) {
        if (!netif_is_up(netif)) {
            continue;
        }
        const ip4_addr_t* ip = netif_ip4_addr(netif);
        if (ip != nullptr && ip4_addr_get_u32(ip) == localAddr) {
            return netif;
        }
    }

    return netif_list;
}

} // namespace

void WifiManager::beginStation(const char* ssid, const char* password) {
    softApMode_ = false;
    loggedConfigUi_ = false;
    strncpy(ssid_, ssid != nullptr ? ssid : "", sizeof(ssid_) - 1);
    strncpy(password_, password != nullptr ? password : "", sizeof(password_) - 1);
    ssid_[sizeof(ssid_) - 1] = '\0';
    password_[sizeof(password_) - 1] = '\0';
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(false);
    WiFi.setSleep(WIFI_PS_NONE);
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

bool WifiManager::isTimeSyncPending() const {
    if (softApMode_ || !sntpStarted_ || timeSynced_ || sntpTimedOut_) {
        return false;
    }
    return millis() - sntpStartedMs_ < SNTP_SYNC_TIMEOUT_MS;
}

bool WifiManager::takeLinkRestored() {
    if (!linkJustRestored_) {
        return false;
    }
    linkJustRestored_ = false;
    return true;
}

void WifiManager::refreshAssociation() {
    if (softApMode_ || ssid_[0] == '\0') {
        return;
    }

    Serial.println(F("[WIFI] refresh association (transport recovery)"));
    const bool hadTimeSync = timeSynced_;
    loggedConnected_ = false;
    loggedConfigUi_ = false;
    WiFi.disconnect(false);
    delay(200);
    state_ = WifiConnectionState::Disconnected;
    nextRetryMs_ = millis();
    retryDelayMs_ = WIFI_RETRY_BASE_MS;
    if (!hadTimeSync) {
        resetTimeSync();
    }
}

void WifiManager::pokeHostArp(const IPAddress& host) {
    if (softApMode_ || !isConnected() || host == IPAddress(0, 0, 0, 0)) {
        return;
    }

    struct netif* lwipNetif = findStaNetif();
    if (lwipNetif == nullptr) {
        return;
    }

    ip4_addr_t target = {};
    IP4_ADDR(&target, host[0], host[1], host[2], host[3]);
    etharp_request(lwipNetif, &target);
}

bool WifiManager::isHostArpResolved(const IPAddress& host) const {
    if (softApMode_ || !isConnected() || host == IPAddress(0, 0, 0, 0)) {
        return false;
    }

    struct netif* lwipNetif = findStaNetif();
    if (lwipNetif == nullptr) {
        return false;
    }

    ip4_addr_t target = {};
    IP4_ADDR(&target, host[0], host[1], host[2], host[3]);
    struct eth_addr* ethRet = nullptr;
    const ip4_addr_t* ipRet = nullptr;
    return etharp_find_addr(lwipNetif, &target, &ethRet, &ipRet) >= 0 && ethRet != nullptr;
}

bool WifiManager::resolveHostArp(const IPAddress& host) {
    if (softApMode_ || !isConnected() || host == IPAddress(0, 0, 0, 0)) {
        return false;
    }

    pokeHostArp(host);
    for (uint8_t poll = 0; poll < 20; ++poll) {
        delay(50);
        yield();
        pokeHostArp(host);
        if (isHostArpResolved(host)) {
            Serial.print(F("[WIFI] ARP resolved "));
            Serial.println(host);
            return true;
        }
    }

    WiFiClient client;
    client.setTimeout(500);
    if (client.connect(host, SOMNET_SERVER_PORT, 500)) {
        client.stop();
        Serial.print(F("[WIFI] ARP resolved (tcp) "));
        Serial.println(host);
        return true;
    }
    client.stop();

    Serial.print(F("[WIFI] ARP unresolved "));
    Serial.println(host);
    return false;
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
    linkJustRestored_ = true;
    WiFi.setSleep(WIFI_PS_NONE);
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
    sntpTimedOut_ = false;
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
        sntpTimedOut_ = true;
        Serial.println(F("[TIME] SNTP sync timeout — hub connect proceeds; expiry deferred to hub type-7"));
    }
}
