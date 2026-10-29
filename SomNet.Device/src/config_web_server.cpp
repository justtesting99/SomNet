#include "config_web_server.h"

#include "config.h"
#include "config_pages.h"
#include "device_identity.h"
#include "nvs_store.h"
#include "signalr_client.h"
#include "wifi_manager.h"
#include "web_ui_shared.h"

#if SOMNET_LOCAL_OPERATE_ENABLED
#include "local_operate.h"
#include "operate_pages.h"
#endif
#if defined(SOMNET_STANDALONE) && SOMNET_STANDALONE
#include "local_history_store.h"
#endif

#include <ESPAsyncWebServer.h>
#include <Arduino.h>
#include <ArduinoJson.h>

static DeviceBootMode gHttpMode = DeviceBootMode::Running;
static AsyncWebServer gHttpServer(CONFIG_HTTP_PORT);
static bool gHttpRoutesRegistered = false;

/** Render buffers in BSS — avoid large stacks on async_tcp (GET /, /config). */
static char gStatusHtmlBuffer[8192];
static char gConfigHtmlBuffer[8192];

namespace {

NvsStore* gNvs = nullptr;
DeviceIdentity* gIdentity = nullptr;
WifiManager* gWifi = nullptr;
SignalRClient* gSignalR = nullptr;
#if SOMNET_LOCAL_OPERATE_ENABLED
LocalOperate* gLocalOperate = nullptr;
#endif

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

ConfigWebServer* gActiveHttpServer = nullptr;

void logHttpRequest(AsyncWebServerRequest* request, const char* path) {
    if (request != nullptr && request->method() == HTTP_GET && gActiveHttpServer != nullptr) {
        gActiveHttpServer->noteFirstGet();
    }
    Serial.print(F("[HTTP] "));
    Serial.print(request->methodToString());
    Serial.print(' ');
    Serial.print(path);
    if (request->client() != nullptr) {
        Serial.print(F(" from "));
        Serial.print(request->client()->remoteIP());
    }
    Serial.println();
}

bool extractUrlHost(const char* url, char* hostOut, size_t hostOutLen) {
    if (url == nullptr || hostOutLen == 0) {
        return false;
    }
    hostOut[0] = '\0';

    const char* hostStart = strstr(url, "://");
    hostStart = hostStart != nullptr ? hostStart + 3 : url;
    if (hostStart[0] == '\0') {
        return false;
    }

    size_t i = 0;
    while (hostStart[i] != '\0' && hostStart[i] != '/' && hostStart[i] != ':' && i + 1 < hostOutLen) {
        hostOut[i] = hostStart[i];
        ++i;
    }
    hostOut[i] = '\0';
    return hostOut[0] != '\0';
}

bool isValidServerUrlHost(const char* host) {
    if (host == nullptr || host[0] == '\0') {
        return false;
    }

    bool numericHost = true;
    int dotCount = 0;
    for (const char* p = host; *p != '\0'; ++p) {
        if (*p == '.') {
            ++dotCount;
        } else if (*p < '0' || *p > '9') {
            numericHost = false;
            break;
        }
    }

    if (numericHost && dotCount > 0) {
        return dotCount == 3;
    }

    return true;
}

bool parseSomNetServerUrl(const String& serverUrlIn, char* serverBuf, size_t serverBufLen, bool& useTlsOut, String& errorOut) {
    if (serverBuf == nullptr || serverBufLen == 0) {
        errorOut = "Internal error";
        return false;
    }
    serverBuf[0] = '\0';
    useTlsOut = false;

    String serverUrl = serverUrlIn;
    serverUrl.trim();
    if (serverUrl.length() == 0) {
        errorOut = "Server URL is required";
        return false;
    }
    if (containsHubSuffix(serverUrl.c_str())) {
        errorOut = "Use API base URL only (no /hubs/hardware)";
        return false;
    }

    strncpy(serverBuf, serverUrl.c_str(), serverBufLen - 1);
    serverBuf[serverBufLen - 1] = '\0';
    trimTrailingSlashes(serverBuf);

    char serverHost[96];
    if (!extractUrlHost(serverBuf, serverHost, sizeof(serverHost))) {
        errorOut = "Server URL must include a host (e.g. http://192.168.1.100:5031)";
        return false;
    }
    if (!isValidServerUrlHost(serverHost)) {
        errorOut = "Server host looks like an incomplete IP — use four octets (e.g. 192.168.1.100)";
        return false;
    }

    useTlsOut = strncmp(serverBuf, "https://", 8) == 0;
    return true;
}

bool saveSomNetServerUrl(NvsStore* nvs, const String& serverUrlIn, String& errorOut) {
    if (nvs == nullptr) {
        errorOut = "NVS unavailable";
        return false;
    }

    bool useTls = false;
    char serverBuf[NvsStore::kMaxStringLen] = {};
    if (!parseSomNetServerUrl(serverUrlIn, serverBuf, sizeof(serverBuf), useTls, errorOut)) {
        return false;
    }
    if (!nvs->setServerUrl(serverBuf)) {
        errorOut = "Failed to save server URL";
        return false;
    }
    if (!nvs->setUseTls(useTls)) {
        errorOut = "Failed to save TLS flag";
        return false;
    }
    return true;
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

    bool useTls = false;
    char serverBuf[NvsStore::kMaxStringLen] = {};
#if defined(SOMNET_STANDALONE) && SOMNET_STANDALONE
    serverBuf[0] = '\0';
    useTls = false;
#else
    if (!parseSomNetServerUrl(serverUrl, serverBuf, sizeof(serverBuf), useTls, errorOut)) {
        return false;
    }
#endif

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

    String actuatorKind = request->arg("actuator_kind");
    actuatorKind.trim();
    if (actuatorKind.length() > 0) {
        if (!gNvs->setActuatorKindFromJson(actuatorKind.c_str())) {
            errorOut = "actuator_kind must be relay or hbridge";
            return false;
        }
        Serial.print(F("[HTTP] actuator_kind="));
        Serial.println(actuatorKind);
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

    const size_t len = strlen(html);
    if (strstr(html, "</html>") == nullptr) {
        Serial.println(F("[HTTP] warning: HTML incomplete (buffer truncated?)"));
    }
    Serial.print(F("[HTTP] response bytes="));
    Serial.println(len);
    request->send(200, "text/html", html);
}

void handleSomNetUiCss(AsyncWebServerRequest* request) {
    logHttpRequest(request, "/ui/somnet.css");
    AsyncWebServerResponse* response =
        request->beginResponse_P(200, "text/css", SomNetWebUi::kCssRules);
    response->addHeader("Cache-Control", "public, max-age=3600");
    request->send(response);
}

void handlePing(AsyncWebServerRequest* request) {
    logHttpRequest(request, "/ping");
    request->send(200, "text/plain", "ok");
}

void handleFavicon(AsyncWebServerRequest* request) {
    logHttpRequest(request, "/favicon.ico");
    request->send(204);
}

void handleStatus(AsyncWebServerRequest* request) {
    logHttpRequest(request, "/");
    char serverUrl[NvsStore::kMaxStringLen];
    buildEffectiveServerUrl(serverUrl, sizeof(serverUrl));
    ConfigPages::renderStatus(
        gStatusHtmlBuffer,
        sizeof(gStatusHtmlBuffer),
        *gNvs,
        *gIdentity,
        *gWifi,
        serverUrl,
        gHttpMode == DeviceBootMode::Provisioning,
        gSignalR != nullptr ? gSignalR->hubStateLabel() : "offline",
        gSignalR != nullptr && gSignalR->isHubConnected());
    sendHtml(request, gStatusHtmlBuffer);
}

void handleConfigGet(AsyncWebServerRequest* request) {
    logHttpRequest(request, "/config");
    char serverUrl[NvsStore::kMaxStringLen];
    buildEffectiveServerUrl(serverUrl, sizeof(serverUrl));
    ConfigPages::renderConfigForm(
        gConfigHtmlBuffer,
        sizeof(gConfigHtmlBuffer),
        *gNvs,
        *gIdentity,
        serverUrl,
        gHttpMode == DeviceBootMode::Provisioning);
    sendHtml(request, gConfigHtmlBuffer);
}

void scheduleRestartAfterResponse(AsyncWebServerRequest* request) {
    request->onDisconnect([]() {
        Serial.println(F("[HTTP] response sent — rebooting"));
        delay(100);
        ESP.restart();
    });
}

void handleConfigPost(AsyncWebServerRequest* request) {
    logHttpRequest(request, "/config");
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

void applySomEspHubModeFromNvs() {
    if (gNvs == nullptr || gSignalR == nullptr) {
        return;
    }
    gSignalR->applySomEspHubEnabled(gNvs->isHubRuntimeEnabled());
}

void sendHubModeJson(AsyncWebServerRequest* request, int httpCode = 200) {
    char serverUrl[NvsStore::kMaxStringLen];
    buildEffectiveServerUrl(serverUrl, sizeof(serverUrl));
    const bool paired = gNvs != nullptr && gNvs->isPaired();
    const bool hasUrl = gNvs != nullptr && gNvs->hasHubServerUrl();
    const bool hubEnabled = gNvs != nullptr && gNvs->isHubRuntimeEnabled();
    const bool setupAp = gWifi != nullptr && gWifi->isSoftAp();
    const bool canToggle = hasUrl && paired && !setupAp;
    const bool hubConnected = gSignalR != nullptr && gSignalR->isHubConnected();
    const char* hubState = gSignalR != nullptr ? gSignalR->hubStateLabel() : "offline";

    char json[640];
    snprintf(
        json,
        sizeof(json),
        "{\"serverUrl\":\"%s\",\"paired\":%s,\"hubEnabled\":%s,\"canToggle\":%s,"
        "\"hubConnected\":%s,\"hubState\":\"%s\"}",
        serverUrl,
        paired ? "true" : "false",
        hubEnabled ? "true" : "false",
        canToggle ? "true" : "false",
        hubConnected ? "true" : "false",
        hubState);
    request->send(httpCode, "application/json", json);
}

void handleApiHubModeGet(AsyncWebServerRequest* request) {
    logHttpRequest(request, "/api/hub/mode");
    if (gWifi != nullptr && gWifi->isSoftAp()) {
        request->send(403, "application/json", "{\"error\":\"setup_mode\"}");
        return;
    }
    sendHubModeJson(request);
}

void handleApiHubModePostBody(AsyncWebServerRequest* request, const char* body, size_t len) {
    if (gWifi != nullptr && gWifi->isSoftAp()) {
        request->send(403, "application/json", "{\"error\":\"setup_mode\"}");
        return;
    }
    if (gNvs == nullptr || gSignalR == nullptr) {
        request->send(500, "application/json", "{\"error\":\"unavailable\"}");
        return;
    }

    JsonDocument doc;
    if (deserializeJson(doc, body, len)) {
        request->send(400, "application/json", "{\"error\":\"invalid_json\"}");
        return;
    }

    if (!doc["enabled"].is<bool>()) {
        request->send(400, "application/json", "{\"error\":\"enabled_required\"}");
        return;
    }

    const bool enabled = doc["enabled"].as<bool>();
    if (enabled) {
        if (!gNvs->hasHubServerUrl()) {
            request->send(400, "application/json", "{\"error\":\"no_server_url\"}");
            return;
        }
        if (!gNvs->isPaired()) {
            request->send(400, "application/json", "{\"error\":\"not_paired\"}");
            return;
        }
    }

    if (!gNvs->setHubRuntimeEnabled(enabled)) {
        request->send(500, "application/json", "{\"error\":\"nvs_failed\"}");
        return;
    }

    gSignalR->applySomEspHubEnabled(enabled);
    Serial.print(F("[HTTP] hub runtime "));
    Serial.println(enabled ? F("enabled") : F("disabled (local)"));
    sendHubModeJson(request);
}

void handleApiHubModePost(
    AsyncWebServerRequest* request,
    uint8_t* data,
    size_t len,
    size_t index,
    size_t total) {
    static String body;
    if (index == 0) {
        body = "";
        if (total > 128) {
            request->send(413, "application/json", "{\"error\":\"body_too_large\"}");
            return;
        }
    }
    for (size_t i = 0; i < len; ++i) {
        body += static_cast<char>(data[i]);
    }
    if (index + len < total) {
        return;
    }
    logHttpRequest(request, "/api/hub/mode");
    handleApiHubModePostBody(request, body.c_str(), body.length());
}

void handleConnectSomNet(AsyncWebServerRequest* request) {
    logHttpRequest(request, "/config/connect-somnet");
    if (gWifi != nullptr && gWifi->isSoftAp()) {
        request->send(403, "text/plain", "Finish Wi-Fi setup first");
        return;
    }
    String error;
    if (!saveSomNetServerUrl(gNvs, request->arg("server_url"), error)) {
        request->send(400, "text/plain", error);
        return;
    }

    if (gNvs != nullptr) {
        gNvs->setHubRuntimeEnabled(true);
    }
    applySomEspHubModeFromNvs();

    Serial.println(F("[HTTP] SomNet server_url saved — hub connecting (no reboot)"));

    char html[2560];
    ConfigPages::renderSavedPage(
        html,
        sizeof(html),
        "SomNet server saved. Hub is connecting — return to Status to pair or use the remote/local switch.");
    sendHtml(request, html);
}

void handleApiStatus(AsyncWebServerRequest* request) {
    logHttpRequest(request, "/api/status");
    char serverUrl[NvsStore::kMaxStringLen];
    char friendly[NvsStore::kMaxStringLen];
    buildEffectiveServerUrl(serverUrl, sizeof(serverUrl));
    gNvs->getFriendlyName(friendly, sizeof(friendly));

    char json[1024];
    if (kSomNetStandaloneBuild) {
        const bool hubEnabled = gNvs->isHubRuntimeEnabled();
        if (gNvs->hasHubServerUrl()) {
            snprintf(
                json,
                sizeof(json),
                "{\"standalone\":true,\"hubNetwork\":%s,\"hubEnabled\":%s,\"deviceId\":\"%s\",\"mac\":\"%s\",\"friendlyName\":\"%s\",\"paired\":%s,\"wifiConnected\":%s,\"ip\":\"%s\",\"serverUrl\":\"%s\",\"mode\":\"%s\",\"hubConnected\":%s,\"hubState\":\"%s\"}",
                hubEnabled ? "true" : "false",
                hubEnabled ? "true" : "false",
                gIdentity->deviceId(),
                gIdentity->macAddress(),
                friendly,
                gNvs->isPaired() ? "true" : "false",
                gWifi->isStaLinkReady() ? "true" : "false",
                gWifi->localIp(),
                serverUrl,
                gHttpMode == DeviceBootMode::Provisioning ? "provisioning" : "running",
                hubEnabled && gSignalR != nullptr && gSignalR->isHubConnected() ? "true" : "false",
                hubEnabled && gSignalR != nullptr ? gSignalR->hubStateLabel() : "local");
        } else {
            snprintf(
                json,
                sizeof(json),
                "{\"standalone\":true,\"hubNetwork\":false,\"hubEnabled\":false,\"deviceId\":\"%s\",\"mac\":\"%s\",\"friendlyName\":\"%s\",\"wifiConnected\":%s,\"ip\":\"%s\",\"mode\":\"%s\",\"hubConnected\":false,\"hubState\":\"disabled\"}",
                gIdentity->deviceId(),
                gIdentity->macAddress(),
                friendly,
                gWifi->isStaLinkReady() ? "true" : "false",
                gWifi->localIp(),
                gHttpMode == DeviceBootMode::Provisioning ? "provisioning" : "running");
        }
    } else {
        const bool hubEnabled = gNvs->isHubRuntimeEnabled();
        snprintf(
            json,
            sizeof(json),
            "{\"standalone\":false,\"localOperate\":%s,\"hubEnabled\":%s,\"deviceId\":\"%s\",\"mac\":\"%s\",\"friendlyName\":\"%s\",\"paired\":%s,\"wifiConnected\":%s,\"ip\":\"%s\",\"serverUrl\":\"%s\",\"mode\":\"%s\",\"hubConnected\":%s,\"hubState\":\"%s\"}",
            kSomNetLocalOperateEnabled ? "true" : "false",
            hubEnabled ? "true" : "false",
            gIdentity->deviceId(),
            gIdentity->macAddress(),
            friendly,
            gNvs->isPaired() ? "true" : "false",
            gWifi->isStaLinkReady() ? "true" : "false",
            gWifi->localIp(),
            serverUrl,
            gHttpMode == DeviceBootMode::Provisioning ? "provisioning" : "running",
            hubEnabled && gSignalR != nullptr && gSignalR->isHubConnected() ? "true" : "false",
            hubEnabled && gSignalR != nullptr ? gSignalR->hubStateLabel() : "local");
    }
    request->send(200, "application/json", json);
}

void handleResetWifi(AsyncWebServerRequest* request) {
    logHttpRequest(request, "/config/reset-wifi");
    if (gNvs != nullptr) {
        gNvs->clearProvisioning();
    }
    scheduleRestartAfterResponse(request);
    char html[2560];
    ConfigPages::renderSavedPage(html, sizeof(html), "Wi-Fi settings cleared.");
    sendHtml(request, html);
}

void handleFactoryReset(AsyncWebServerRequest* request) {
    logHttpRequest(request, "/config/factory-reset");
    if (gNvs != nullptr) {
        gNvs->clearAll();
    }
#if defined(SOMNET_STANDALONE) && SOMNET_STANDALONE
    localHistoryClearAll();
#endif
    scheduleRestartAfterResponse(request);
    char html[2560];
    ConfigPages::renderSavedPage(html, sizeof(html), "Factory reset complete.");
    sendHtml(request, html);
}

void handleCaptivePortalProbe(AsyncWebServerRequest* request) {
    logHttpRequest(request, request->url().c_str());
    request->redirect("/");
}

void registerRoutes(AsyncWebServer& server) {
    server.on("/ping", HTTP_GET, handlePing);
    server.on("/favicon.ico", HTTP_GET, handleFavicon);
    server.on("/ui/somnet.css", HTTP_GET, handleSomNetUiCss);
    server.on("/", HTTP_GET, handleStatus);
    server.on("/generate_204", HTTP_GET, handleCaptivePortalProbe);
    server.on("/gen_204", HTTP_GET, handleCaptivePortalProbe);
    server.on("/hotspot-detect.html", HTTP_GET, handleCaptivePortalProbe);
    server.on("/library/test/success.html", HTTP_GET, handleCaptivePortalProbe);
    server.on("/connectivity-check.html", HTTP_GET, handleCaptivePortalProbe);
    server.on("/ncsi.txt", HTTP_GET, handleCaptivePortalProbe);
    server.on("/canonical.html", HTTP_GET, handleCaptivePortalProbe);
    server.on("/config/reset-wifi", HTTP_POST, handleResetWifi);
    server.on("/config/factory-reset", HTTP_POST, handleFactoryReset);
    server.on("/config/", HTTP_GET, [](AsyncWebServerRequest* request) {
        logHttpRequest(request, "/config/");
        request->redirect("/config");
    });
    server.on(AsyncURIMatcher::exact("/config"), HTTP_GET, handleConfigGet);
    server.on(AsyncURIMatcher::exact("/config"), HTTP_POST, handleConfigPost);
    server.on("/api/status", HTTP_GET, handleApiStatus);
#if defined(SOMNET_STANDALONE) && SOMNET_STANDALONE
    server.on("/config/connect-somnet", HTTP_POST, handleConnectSomNet);
#endif
#if SOMNET_LOCAL_OPERATE_ENABLED
    server.on("/api/hub/mode", HTTP_GET, handleApiHubModeGet);
    server.on(
        "/api/hub/mode",
        HTTP_POST,
        [](AsyncWebServerRequest* request) {},
        nullptr,
        [](AsyncWebServerRequest* request, uint8_t* data, size_t len, size_t index, size_t total) {
            handleApiHubModePost(request, data, len, index, total);
        });
    server.on("/operate", HTTP_GET, [](AsyncWebServerRequest* request) {
        if (gWifi != nullptr && gWifi->isSoftAp()) {
            request->redirect("/");
            return;
        }
        OperatePages::handleOperateGet(request);
    });
    server.on("/operate/", HTTP_GET, [](AsyncWebServerRequest* request) {
        request->redirect("/operate");
    });
    if (gLocalOperate != nullptr) {
        registerLocalApiRoutes(server, gLocalOperate);
    }
#endif
    server.onNotFound([](AsyncWebServerRequest* request) {
        Serial.print(F("[HTTP] 404 "));
        Serial.println(request->url());
        const char* url = request->url().c_str();
        if (url != nullptr &&
            (strcmp(url, "/operate") == 0 || strncmp(url, "/operate/", 9) == 0) &&
            !kSomNetLocalOperateEnabled) {
            request->send(
                404,
                "text/html",
                "<!DOCTYPE html><html><body style=\"font-family:system-ui;background:#020617;"
                "color:#cbd5e1;padding:1.5rem\"><h1>/operate not available</h1>"
                "<p>This firmware was built without LAN local control "
                "(<code>SOMNET_LOCAL_API</code> / <code>env:somesp</code>).</p>"
                "<p><a href=\"/\" style=\"color:#818cf8\">Back to status</a></p></body></html>");
            return;
        }
        request->redirect("/");
    });
}

} // namespace

void ConfigWebServer::setBootMode(DeviceBootMode mode) {
    mode_ = mode;
    gHttpMode = mode;
}

void ConfigWebServer::resetListenState() {
    if (started_) {
        gHttpServer.end();
    }
    started_ = false;
    staIpSinceMs_ = 0;
    httpStartedMs_ = 0;
    httpFirstGetMs_ = 0;
}

void ConfigWebServer::rebindListenState() {
    if (!started_) {
        return;
    }
    gHttpServer.end();
    started_ = false;
    staIpSinceMs_ = 0;
    httpStartedMs_ = 0;
    httpFirstGetMs_ = 0;
    ++healthRebindCount_;
    Serial.println(F("[HTTP] health rebind"));
}

void ConfigWebServer::noteFirstGet() {
    if (httpFirstGetMs_ == 0) {
        httpFirstGetMs_ = millis();
    }
}

bool ConfigWebServer::begin(
    DeviceBootMode mode,
    NvsStore* nvsStore,
    DeviceIdentity* identity,
    WifiManager* wifi,
    SignalRClient* signalRClient,
    LocalOperate* localOperate) {
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
#if SOMNET_LOCAL_OPERATE_ENABLED
    gLocalOperate = localOperate;
#endif
    gHttpMode = mode;
    staIpSinceMs_ = 0;
    gActiveHttpServer = this;
    return true;
}

void ConfigWebServer::poll() {
    if (wifi_ == nullptr) {
        return;
    }

    if (!wifi_->isConnected()) {
        staIpSinceMs_ = 0;
        return;
    }

    if (started_) {
        const bool provisioningUi =
            wifi_->isSoftAp() || mode_ == DeviceBootMode::Provisioning;
        if (!provisioningUi && httpFirstGetMs_ == 0 && httpStartedMs_ != 0 &&
            staIpSinceMs_ != 0 &&
            millis() - staIpSinceMs_ >= CONFIG_HTTP_HEALTH_GRACE_MS &&
            millis() - (staIpSinceMs_ + CONFIG_HTTP_HEALTH_GRACE_MS) >= CONFIG_HTTP_HEALTH_NO_GET_MS &&
            healthRebindCount_ < CONFIG_HTTP_HEALTH_REBIND_MAX) {
            rebindListenState();
        }
        return;
    }

    const bool provisioningUi =
        wifi_->isSoftAp() || mode_ == DeviceBootMode::Provisioning;
    if (!provisioningUi) {
        if (staIpSinceMs_ == 0) {
            staIpSinceMs_ = millis();
        }
        if (millis() - staIpSinceMs_ < CONFIG_HTTP_STA_SETTLE_MS) {
            return;
        }
    }

    if (!gHttpRoutesRegistered) {
        registerRoutes(gHttpServer);
        gHttpRoutesRegistered = true;
    }
    gHttpServer.begin();
    started_ = true;
    httpStartedMs_ = millis();
    httpFirstGetMs_ = 0;

    Serial.print(F("[HTTP] server started on port "));
    Serial.println(CONFIG_HTTP_PORT);
}
