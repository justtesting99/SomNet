#include <Arduino.h>

#include "config.h"

#include "button_input.h"
#include "command_handler.h"
#include "config_web_server.h"
#include "device_identity.h"
#include "device_mode.h"
#include "execution_context.h"
#include "nvs_store.h"
#include "relay_controller.h"
#include "signalr_client.h"
#include "wifi_manager.h"

namespace {

WifiManager wifiManager;
DeviceIdentity deviceIdentity;
NvsStore nvsStore;
RelayController relayController;
ExecutionContext executionContext;
CommandHandler commandHandler;
ButtonInput buttonInput;
SignalRClient signalRClient;
ConfigWebServer configWebServer;

DeviceBootMode bootMode = DeviceBootMode::Running;
bool bannerPrinted = false;
bool wifiRecoveryAttempted = false;

void buildEffectiveServerUrl(char* out, size_t outLen) {
    out[0] = '\0';
    if (nvsStore.getServerUrl(out, outLen)) {
        return;
    }
    if (SOMNET_SERVER_HOST[0] != '\0') {
        snprintf(out, outLen, "http://%s:%d", SOMNET_SERVER_HOST, SOMNET_SERVER_PORT);
    }
}

void buildSoftApName(char* out, size_t outLen) {
    const char* deviceId = deviceIdentity.deviceId();
    const size_t idLen = strlen(deviceId);
    const char* suffix = idLen >= 4 ? deviceId + idLen - 4 : "0000";
    snprintf(out, outLen, "SomNet-Setup-%s", suffix);
}

void startNetwork() {
    if (bootMode == DeviceBootMode::Provisioning) {
        char apName[32];
        buildSoftApName(apName, sizeof(apName));
        wifiManager.beginSoftAp(apName);
        return;
    }

    char ssid[NvsStore::kMaxStringLen] = {};
    char pass[NvsStore::kMaxStringLen] = {};

    if (nvsStore.isFullyProvisioned() && nvsStore.getWifiSsid(ssid, sizeof(ssid))) {
        nvsStore.getWifiPass(pass, sizeof(pass));
        Serial.println(F("[MODE] RUNNING (NVS credentials)"));
    } else if (WIFI_SSID[0] != '\0') {
        strncpy(ssid, WIFI_SSID, sizeof(ssid) - 1);
        strncpy(pass, WIFI_PASSWORD, sizeof(pass) - 1);
        ssid[sizeof(ssid) - 1] = '\0';
        pass[sizeof(pass) - 1] = '\0';
        Serial.println(F("[MODE] RUNNING (secrets.ini fallback)"));
    } else {
        Serial.println(F("[MODE] PROVISIONING (no credentials)"));
        bootMode = DeviceBootMode::Provisioning;
        char apName[32];
        buildSoftApName(apName, sizeof(apName));
        wifiManager.beginSoftAp(apName);
        return;
    }

    Serial.print(F("[WIFI] using SSID="));
    Serial.println(ssid);
    wifiManager.beginStation(ssid, pass);
}

void tryWifiRecovery() {
    if (wifiRecoveryAttempted || bootMode == DeviceBootMode::Provisioning || wifiManager.isSoftAp()) {
        return;
    }
    if (!nvsStore.isFullyProvisioned()) {
        return;
    }
    if (wifiManager.isConnected()) {
        return;
    }
    if (wifiManager.connectFailureCount() < kWifiConnectFailuresBeforeRecovery) {
        return;
    }

    wifiRecoveryAttempted = true;

    Serial.println(F("[WIFI] saved credentials failed — clearing Wi-Fi and entering setup AP"));
    Serial.println(F("[WIFI] re-provision at http://192.168.4.1/ (check SSID/password)"));
    nvsStore.clearProvisioning();
    bootMode = DeviceBootMode::Provisioning;
    configWebServer.setBootMode(DeviceBootMode::Provisioning);
    signalRClient.poll();
    char apName[32];
    buildSoftApName(apName, sizeof(apName));
    wifiManager.beginSoftAp(apName);
    configWebServer.poll();
}

void printSerialBanner() {
    char serverUrl[NvsStore::kMaxStringLen];
    buildEffectiveServerUrl(serverUrl, sizeof(serverUrl));

    Serial.println(F("========================================"));
    Serial.println(F(" SomNet Device Firmware"));
    Serial.print(F(" Version: "));
    Serial.println(FIRMWARE_VERSION);
    Serial.print(F(" Mode: "));
    Serial.println(bootMode == DeviceBootMode::Provisioning ? F("PROVISIONING") : F("RUNNING"));
    Serial.print(F(" Device ID: "));
    Serial.println(deviceIdentity.deviceId());
    Serial.print(F(" MAC: "));
    Serial.println(deviceIdentity.macAddress());
    Serial.print(F(" Pairing: "));
    Serial.println(nvsStore.isPaired() ? F("paired") : F("not paired"));
    Serial.print(F(" Wi-Fi: "));
    if (wifiManager.isSoftAp()) {
        Serial.println(F("setup AP"));
    } else {
        Serial.println(wifiManager.isConnected() ? F("connected") : F("disconnected / retrying"));
    }
    Serial.print(F(" IP: "));
    Serial.println(wifiManager.localIp());
    Serial.print(F(" Server: "));
    Serial.println(serverUrl[0] != '\0' ? serverUrl : "(not configured)");
    Serial.println(F(" Log prefixes: [WIFI] [HTTP] [HUB] [CMD] [STROKE] [RELAY] [NVS] [ID]"));
    Serial.println(F("========================================"));
}

} // namespace

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println();
    Serial.println(F("[BOOT] SomNet.Device starting"));

    if (!nvsStore.begin()) {
        Serial.println(F("[NVS] failed to open namespace"));
    } else {
        Serial.println(F("[NVS] opened"));
    }

    nvsStoreSetInstance(&nvsStore);
    deviceIdentity.begin(nvsStore);

    if (nvsStore.isFullyProvisioned() || WIFI_SSID[0] != '\0') {
        bootMode = DeviceBootMode::Running;
    } else {
        bootMode = DeviceBootMode::Provisioning;
    }

    relayController.begin();
    executionContext.begin(&relayController);
    buttonInput.begin();
    signalRClient.begin(&nvsStore, &deviceIdentity, &wifiManager);
    commandHandler.begin(&executionContext, &nvsStore, &deviceIdentity, &signalRClient);

    startNetwork();
    configWebServer.begin(bootMode, &nvsStore, &deviceIdentity, &wifiManager, &signalRClient);
}

void loop() {
    wifiManager.poll();
    tryWifiRecovery();
    signalRClient.poll();
    relayController.poll();
    executionContext.poll();
    commandHandler.poll();
    buttonInput.poll();
    configWebServer.poll();

    if (!bannerPrinted && millis() >= 1500) {
        printSerialBanner();
        bannerPrinted = true;
    }

    yield();
}
