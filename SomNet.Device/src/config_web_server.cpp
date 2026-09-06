#include "config_web_server.h"

#include "config.h"
#include "config_pages.h"
#include "device_identity.h"
#include "nvs_store.h"
#include "signalr_client.h"
#include "wifi_manager.h"

#include <ESPAsyncWebServer.h>
#include <Arduino.h>

static DeviceBootMode gHttpMode = DeviceBootMode::Running;

namespace {

NvsStore* gNvs = nullptr;
DeviceIdentity* gIdentity = nullptr;
WifiManager* gWifi = nullptr;
SignalRClient* gSignalR = nullptr;

void buildEffectiveServerUrl(char* out, size_t outLen) {
    out[0] = '\0';
    if (gNvs == nullptr) {
        return;
    }

    if (gNvs->getServerUrl(out, outLen)) {
        return;
    }

    if (SOMNET_SERVER_HOST[0] != '\0') {
        snprintf(out, outLen, "http://%s:%d", SOMNET_SERVER_HOST, SOMNET_SERVER_PORT);
    }
}

bool containsHubSuffix(const char* url) {
    return url != nullptr && strstr(url, "/hubs/hardware") != nullptr;
}

void trimTrailingSlashes(char* url) {
    if (url == nullptr) {
        return;
    }
    size_t len = strlen(url);
    while (len > 0 && url[len - 1] == '/') {
        url[--len] = '\0';
    }
}

bool saveConfigFromRequest(AsyncWebServerRequest* request, String& errorOut) {
    if (gNvs == nullptr) {
        errorOut = "NVS unavailable";
        return false;
    }

    String wifiSsid = request->arg("wifi_ssid");
    String wifiPass = request->arg("wifi_pass");
    String serverUrl = request->arg("server_url");
    wifiSsid.trim();
    wifiPass.trim();
    serverUrl.trim();

    const bool allowCredentialFallback = gNvs->isFullyProvisioned();

    if (wifiSsid.length() == 0) {
        char existing[NvsStore::kMaxStringLen];
        if (allowCredentialFallback && gNvs->getWifiSsid(existing, sizeof(existing))) {
            wifiSsid = existing;
        } else if (allowCredentialFallback && WIFI_SSID[0] != '\0') {
            wifiSsid = WIFI_SSID;
        }
    }

    if (wifiPass.length() == 0) {
        char existing[NvsStore::kMaxStringLen];
        if (allowCredentialFallback && gNvs->getWifiPass(existing, sizeof(existing))) {
            wifiPass = existing;
        } else if (allowCredentialFallback && WIFI_PASSWORD[0] != '\0') {
            wifiPass = WIFI_PASSWORD;
        }
    }

    if (wifiSsid.length() == 0) {
        errorOut = "Wi-Fi SSID is required";
        return false;
    }
    if (wifiPass.length() == 0) {
        errorOut = "Wi-Fi password is required";
        return false;
    }
    if (serverUrl.length() == 0) {
        errorOut = "Server URL is required";
        return false;
    }
    if (containsHubSuffix(serverUrl.c_str())) {
        errorOut = "Use API base URL only (no /hubs/hardware)";
        return false;
    }

    char serverBuf[NvsStore::kMaxStringLen];
    strncpy(serverBuf, serverUrl.c_str(), sizeof(serverBuf) - 1);
    serverBuf[sizeof(serverBuf) - 1] = '\0';
    trimTrailingSlashes(serverBuf);

    const bool useTls = strncmp(serverBuf, "https://", 8) == 0;

    if (!gNvs->setWifiSsid(wifiSsid.c_str())) {
        errorOut = "Failed to save Wi-Fi SSID";
        return false;
    }
    if (!gNvs->setWifiPass(wifiPass.c_str())) {
        errorOut = "Failed to save Wi-Fi password";
        return false;
    }
    if (!gNvs->setServerUrl(serverBuf)) {
        errorOut = "Failed to save server URL";
        return false;
    }
    if (!gNvs->setUseTls(useTls)) {
        errorOut = "Failed to save TLS flag";
        return false;
    }

    String friendlyName = request->arg("friendly_name");
    String installerContact = request->arg("installer_contact");
    friendlyName.trim();
    installerContact.trim();

    if (friendlyName.length() == 0) {
        char existing[NvsStore::kMaxStringLen];
        if (gNvs->getFriendlyName(existing, sizeof(existing))) {
            friendlyName = existing;
        }
    }

    if (installerContact.length() == 0) {
        char existing[NvsStore::kMaxStringLen];
        if (gNvs->getInstallerContact(existing, sizeof(existing))) {
            installerContact = existing;
        }
    }

    if (!gNvs->setFriendlyName(friendlyName.c_str())) {
        errorOut = "Failed to save friendly name";
        return false;
    }
    if (!gNvs->setInstallerContact(installerContact.c_str())) {
        errorOut = "Failed to save installer contact";
        return false;
    }

    if (!gNvs->setProvisioned(true)) {
        errorOut = "Failed to mark provisioned";
        return false;
    }

    Serial.print(F("[HTTP] saved wifi ssid="));
    Serial.print(wifiSsid);
    Serial.print(F(" pass_len="));
    Serial.print(wifiPass.length());
    Serial.print(F(" friendly="));
    Serial.print(friendlyName.length() > 0 ? friendlyName.c_str() : "(none)");
    Serial.print(F(" installer="));
    Serial.println(installerContact.length() > 0 ? installerContact.c_str() : "(none)");

    return true;
}

void sendHtml(AsyncWebServerRequest* request, const char* html) {
    if (html == nullptr || html[0] == '\0') {
        Serial.println(F("[HTTP] warning: empty HTML response"));
        request->send(500, "text/plain", "Page render failed");
        return;
    }

    Serial.print(F("[HTTP] response bytes="));
    Serial.println(strlen(html));
    request->send(200, "text/html", html);
}

void handlePing(AsyncWebServerRequest* request) {
    request->send(200, "text/plain", "ok");
}

void handleFavicon(AsyncWebServerRequest* request) {
    request->send(204);
}

void handleStatus(AsyncWebServerRequest* request) {
    char html[5120];
    char serverUrl[NvsStore::kMaxStringLen];
    buildEffectiveServerUrl(serverUrl, sizeof(serverUrl));
    ConfigPages::renderStatus(
        html,
        sizeof(html),
        *gNvs,
        *gIdentity,
        *gWifi,
        serverUrl,
        gHttpMode == DeviceBootMode::Provisioning,
        gSignalR != nullptr ? gSignalR->hubStateLabel() : "offline",
        gSignalR != nullptr && gSignalR->isHubConnected());
    sendHtml(request, html);
}

void handleConfigGet(AsyncWebServerRequest* request) {
    char html[5120];
    char serverUrl[NvsStore::kMaxStringLen];
    buildEffectiveServerUrl(serverUrl, sizeof(serverUrl));
    ConfigPages::renderConfigForm(
        html,
        sizeof(html),
        *gNvs,
        *gIdentity,
        serverUrl,
        gHttpMode == DeviceBootMode::Provisioning);
    sendHtml(request, html);
}

void scheduleRestartAfterResponse(AsyncWebServerRequest* request) {
    request->onDisconnect([]() {
        Serial.println(F("[HTTP] response sent — rebooting"));
        delay(100);
        ESP.restart();
    });
}

void handleConfigPost(AsyncWebServerRequest* request) {
    String error;
    if (!saveConfigFromRequest(request, error)) {
        request->send(400, "text/plain", error);
        return;
    }

    Serial.println(F("[HTTP] config saved"));
    scheduleRestartAfterResponse(request);

    char html[2560];
    ConfigPages::renderSavedPage(html, sizeof(html), "Settings saved.");
    sendHtml(request, html);
}

void handleApiStatus(AsyncWebServerRequest* request) {
    char serverUrl[NvsStore::kMaxStringLen];
    char friendly[NvsStore::kMaxStringLen];
    buildEffectiveServerUrl(serverUrl, sizeof(serverUrl));
    gNvs->getFriendlyName(friendly, sizeof(friendly));

    char json[768];
    snprintf(
        json,
        sizeof(json),
        "{\"deviceId\":\"%s\",\"mac\":\"%s\",\"friendlyName\":\"%s\",\"paired\":%s,\"wifiConnected\":%s,\"ip\":\"%s\",\"serverUrl\":\"%s\",\"mode\":\"%s\",\"hubConnected\":%s,\"hubState\":\"%s\"}",
        gIdentity->deviceId(),
        gIdentity->macAddress(),
        friendly,
        gNvs->isPaired() ? "true" : "false",
        gWifi->isConnected() ? "true" : "false",
        gWifi->localIp(),
        serverUrl,
        gHttpMode == DeviceBootMode::Provisioning ? "provisioning" : "running",
        gSignalR != nullptr && gSignalR->isHubConnected() ? "true" : "false",
        gSignalR != nullptr ? gSignalR->hubStateLabel() : "offline");
    request->send(200, "application/json", json);
}

void handleResetWifi(AsyncWebServerRequest* request) {
    if (gNvs != nullptr) {
        gNvs->clearProvisioning();
    }
    scheduleRestartAfterResponse(request);
    char html[2560];
    ConfigPages::renderSavedPage(html, sizeof(html), "Wi-Fi settings cleared.");
    sendHtml(request, html);
}

void handleFactoryReset(AsyncWebServerRequest* request) {
    if (gNvs != nullptr) {
        gNvs->clearAll();
    }
    scheduleRestartAfterResponse(request);
    char html[2560];
    ConfigPages::renderSavedPage(html, sizeof(html), "Factory reset complete.");
    sendHtml(request, html);
}

void registerRoutes(AsyncWebServer& server) {
    server.on("/ping", HTTP_GET, handlePing);
    server.on("/favicon.ico", HTTP_GET, handleFavicon);
    server.on("/", HTTP_GET, handleStatus);
    server.on("/config/reset-wifi", HTTP_POST, handleResetWifi);
    server.on("/config/factory-reset", HTTP_POST, handleFactoryReset);
    server.on(AsyncURIMatcher::exact("/config"), HTTP_GET, handleConfigGet);
    server.on(AsyncURIMatcher::exact("/config"), HTTP_POST, handleConfigPost);
    server.on("/api/status", HTTP_GET, handleApiStatus);
    server.onNotFound([](AsyncWebServerRequest* request) {
        request->redirect("/");
    });
}

} // namespace

void ConfigWebServer::setBootMode(DeviceBootMode mode) {
    mode_ = mode;
    gHttpMode = mode;
}

bool ConfigWebServer::begin(
    DeviceBootMode mode,
    NvsStore* nvsStore,
    DeviceIdentity* identity,
    WifiManager* wifi,
    SignalRClient* signalRClient) {
    if (nvsStore == nullptr || identity == nullptr || wifi == nullptr) {
        return false;
    }

    mode_ = mode;
    nvsStore_ = nvsStore;
    identity_ = identity;
    wifi_ = wifi;
    signalR_ = signalRClient;
    gNvs = nvsStore;
    gIdentity = identity;
    gWifi = wifi;
    gSignalR = signalRClient;
    gHttpMode = mode;
    deferStartUntilMs_ = millis() + CONFIG_HTTP_MAX_DEFER_MS;
    return true;
}

void ConfigWebServer::poll() {
    if (started_ || wifi_ == nullptr || !wifi_->isConnected()) {
        return;
    }

    const bool hubConnected = signalR_ != nullptr && signalR_->isHubConnected();
    const bool maxDeferReached = deferStartUntilMs_ != 0 && millis() >= deferStartUntilMs_;
    if (!hubConnected && !maxDeferReached) {
        return;
    }

    static AsyncWebServer server(CONFIG_HTTP_PORT);
    registerRoutes(server);
    server.begin();
    started_ = true;

    Serial.print(F("[HTTP] server started on port "));
    Serial.println(CONFIG_HTTP_PORT);
}
