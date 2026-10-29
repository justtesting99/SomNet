#include <Arduino.h>

#include "config.h"

#include "button_input.h"
#include "command_handler.h"
#include "config_web_server.h"
#include "device_identity.h"
#include "device_mode.h"
#include "execution_context.h"
#include "nvs_store.h"
#include "actuator_kind.h"
#include "motor_controller.h"
#include "relay_controller.h"
#include "session_accessory_controller.h"
#include "signalr_client.h"
#include "rgb_status_led.h"
#include "wifi_manager.h"

#if SOMNET_LOCAL_OPERATE_ENABLED
#include "local_operate.h"
#endif
#if defined(SOMNET_STANDALONE) && SOMNET_STANDALONE
#include "local_history_store.h"
#endif

namespace {

WifiManager wifiManager;
DeviceIdentity deviceIdentity;
NvsStore nvsStore;
RelayController relayController;
MotorController motorController;
SessionAccessoryController sessionAccessoryController;
ExecutionContext executionContext;
CommandHandler commandHandler;
ButtonInput buttonInput;
SignalRClient signalRClient;
ConfigWebServer configWebServer;
RgbStatusLed rgbStatusLed;
#if SOMNET_LOCAL_OPERATE_ENABLED
LocalOperate localOperate;
#endif

DeviceBootMode bootMode = DeviceBootMode::Running;
bool bannerPrinted = false;
bool wifiRecoveryAttempted = false;
bool motorHardwareDeferredBeginDone = false;

void maybeBeginMotorHardwareAfterWifi() {
    if (motorHardwareDeferredBeginDone) {
        return;
    }
    if (!wifiManager.isConnected() || wifiManager.isSoftAp()) {
        return;
    }
    if (nvsStore.getActuatorKind() != DeviceActuatorKind_HBridge) {
        motorHardwareDeferredBeginDone = true;
        return;
    }

    motorController.beginIfNeeded();
    motorHardwareDeferredBeginDone = true;
    Serial.println(F("[MOTOR] hardware init deferred until Wi-Fi up"));
}
#if SOMNET_LOCAL_OPERATE_ENABLED
bool wasWifiConnectedForLocal = false;
#endif

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
    snprintf(out, outLen, "SomNetSetup-%s", suffix);
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
    } else if (!nvsStore.isCredentialResetPending() && WIFI_SSID[0] != '\0') {
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

void onButtonClick(ButtonClickKind kind, void*) {
    if (bootMode == DeviceBootMode::Provisioning || wifiManager.isSoftAp()) {
        Serial.println(F("[BTN] click dropped (provisioning)"));
        return;
    }
#if SOMNET_LOCAL_OPERATE_ENABLED
    if (kSomNetLocalOperateEnabled && !nvsStore.isHubRuntimeEnabled()) {
        if ((kind == ButtonClickKind::Single || kind == ButtonClickKind::Double) &&
            localOperate.isUnlocked() && !localOperate.isSubReady()) {
            localOperate.acknowledgeSubReady();
        } else if (!localOperate.isUnlocked()) {
            Serial.println(F("[BTN] click ignored (locked — unlock via /operate)"));
        }
        return;
    }
#endif
    if (!nvsStore.isPaired()) {
        Serial.println(F("[BTN] click dropped (not paired)"));
        return;
    }

    const char* clickType = kind == ButtonClickKind::Double ? "double" : "single";
#if SOMNET_LOCAL_OPERATE_ENABLED
    if ((kind == ButtonClickKind::Single || kind == ButtonClickKind::Double) &&
        !localOperate.isSubReady()) {
        localOperate.acknowledgeSubReady();
    }
#endif
    if (!signalRClient.sendReportButtonEvent(clickType)) {
        Serial.println(F("[BTN] click dropped (hub)"));
    }
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
    configWebServer.resetListenState();
    char apName[32];
    buildSoftApName(apName, sizeof(apName));
    wifiManager.beginSoftAp(apName);
    configWebServer.poll();
}

void printSerialBanner() {
    char serverUrl[NvsStore::kMaxStringLen];
    buildEffectiveServerUrl(serverUrl, sizeof(serverUrl));

    Serial.println(F("========================================"));
    Serial.println(kSomNetStandaloneBuild ? F(" SomEsp Standalone Firmware") : F(" SomNet Device Firmware"));
    Serial.print(F(" Version: "));
    Serial.println(FIRMWARE_VERSION);
    Serial.print(F(" Product: "));
    Serial.println(kSomNetStandaloneBuild ? F("STANDALONE (no hub)") : F("SomNet cloud"));
    Serial.print(F(" Mode: "));
    Serial.println(bootMode == DeviceBootMode::Provisioning ? F("PROVISIONING") : F("RUNNING"));
    Serial.print(F(" Device ID: "));
    Serial.println(deviceIdentity.deviceId());
    Serial.print(F(" Actuator: "));
    Serial.println(actuatorKindToJson(nvsStore.getActuatorKind()));
    Serial.print(F(" MAC: "));
    Serial.println(deviceIdentity.macAddress());
    if (!kSomNetStandaloneBuild) {
        Serial.print(F(" Pairing: "));
        Serial.println(nvsStore.isPaired() ? F("paired") : F("not paired"));
    } else if (nvsStore.hasHubServerUrl()) {
        Serial.print(F(" Hub: network ("));
        Serial.print(nvsStore.isPaired() ? F("paired") : F("not paired"));
        Serial.println(F(")"));
    } else {
        Serial.println(F(" Hub: disabled (local /operate only)"));
    }
    Serial.print(F(" Wi-Fi: "));
    if (wifiManager.isSoftAp()) {
        Serial.println(F("setup AP"));
        Serial.print(F(" Setup SSID: SomNetSetup-"));
        const char* deviceId = deviceIdentity.deviceId();
        const size_t idLen = strlen(deviceId);
        Serial.println(idLen >= 4 ? deviceId + idLen - 4 : "????");
        Serial.print(F(" Setup password: "));
        Serial.println(SETUP_AP_PASSWORD);
    } else {
        Serial.println(wifiManager.isConnected() ? F("connected") : F("disconnected / retrying"));
    }
    Serial.print(F(" IP: "));
    Serial.println(wifiManager.localIp());
    if (!kSomNetStandaloneBuild) {
        Serial.print(F(" Server: "));
        Serial.println(serverUrl[0] != '\0' ? serverUrl : "(not configured)");
    } else if (nvsStore.hasHubServerUrl()) {
        Serial.print(F(" Server: "));
        Serial.println(serverUrl[0] != '\0' ? serverUrl : "(not configured)");
    } else {
        Serial.print(F(" Control: http://"));
        Serial.print(wifiManager.localIp());
        Serial.println(F("/operate"));
    }
    Serial.println(F(" Log prefixes: [WIFI] [TIME] [HTTP] [HUB] [CMD] [STROKE] [RELAY] [MOTOR] [NVS] [ID]"));
    Serial.println(F("========================================"));
}

} // namespace

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println();
    Serial.print(F("[BOOT] "));
    Serial.print(kSomNetStandaloneBuild ? F("SomEsp") : F("SomNet.Device"));
    Serial.print(F(" starting, firmware "));
    Serial.println(FIRMWARE_VERSION);

    if (!nvsStore.begin()) {
        Serial.println(F("[NVS] failed to open namespace"));
    } else {
        Serial.println(F("[NVS] opened"));
    }

    nvsStoreSetInstance(&nvsStore);
    deviceIdentity.begin(nvsStore);

    if (nvsStore.isCredentialResetPending()) {
        bootMode = DeviceBootMode::Provisioning;
        Serial.println(F("[BOOT] credential reset pending — setup AP (ignore secrets.ini)"));
    } else if (nvsStore.isFullyProvisioned() || WIFI_SSID[0] != '\0') {
        bootMode = DeviceBootMode::Running;
    } else {
        bootMode = DeviceBootMode::Provisioning;
    }

    relayController.begin();
    sessionAccessoryController.begin();
    executionContext.begin(&relayController);
    buttonInput.begin();
    buttonInput.setClickHandler(onButtonClick, nullptr);
    signalRClient.begin(&nvsStore, &deviceIdentity, &wifiManager);
    signalRClient.setExecutionActiveProbe([]() { return executionContext.isActive(); });
    commandHandler.begin(
        &executionContext,
        &nvsStore,
        &deviceIdentity,
        &signalRClient,
        &sessionAccessoryController,
        &motorController);

    Serial.println(F("[BOOT] starting network"));
    Serial.flush();
    startNetwork();

    rgbStatusLed.begin();
    Serial.println(F("[BOOT] RGB init (B on D21 — not D1/UART TX)"));
    Serial.flush();

#if SOMNET_LOCAL_OPERATE_ENABLED
    localOperate.begin(&nvsStore, &sessionAccessoryController);
    commandHandlerSetLocalOperate(&localOperate);
    localApiSetExecutionContext(&executionContext);
    localApiSetWifiManager(&wifiManager);
    localApiSetCommandHandler(&commandHandler, &deviceIdentity);
#if defined(SOMNET_STANDALONE) && SOMNET_STANDALONE
    localHistoryBegin(&nvsStore, &wifiManager);
#endif
    configWebServer.begin(
        bootMode,
        &nvsStore,
        &deviceIdentity,
        &wifiManager,
        &signalRClient,
        &localOperate);
    Serial.println(F("[BOOT] setup complete"));
    Serial.flush();
#else
    configWebServer.begin(bootMode, &nvsStore, &deviceIdentity, &wifiManager, &signalRClient);
    Serial.println(F("[BOOT] setup complete"));
    Serial.flush();
#endif
}

void loop() {
    wifiManager.poll();
    maybeBeginMotorHardwareAfterWifi();
#if SOMNET_LOCAL_OPERATE_ENABLED
    const bool wifiStaUp = wifiManager.isStaLinkReady();
    if (wasWifiConnectedForLocal && !wifiStaUp) {
        localOperate.onWifiDisconnected();
    }
    wasWifiConnectedForLocal = wifiStaUp;
#else
    if (!wifiManager.isSoftAp() && !wifiManager.isConnected()) {
        sessionAccessoryController.releaseSafety();
    }
#endif
    tryWifiRecovery();
    configWebServer.poll();
    signalRClient.poll();
#if SOMNET_LOCAL_OPERATE_ENABLED
    static bool hubWasConnected = false;
    const bool hubConnected = signalRClient.isHubConnected();
    if (hubConnected && !hubWasConnected && localOperate.isSubReady()) {
        (void)signalRClient.sendReportButtonEvent("single");
    }
    hubWasConnected = hubConnected;
#endif
    RgbStatusInputs rgbIn;
    rgbIn.credentialResetFlash = buttonInput.isAwaitingCredentialResetRelease();
    rgbIn.provisioningSoftAp = bootMode == DeviceBootMode::Provisioning || wifiManager.isSoftAp();
    rgbIn.wifiStaUp = wifiManager.isStaLinkReady();
#if SOMNET_LOCAL_OPERATE_ENABLED
    rgbIn.subReady = localOperate.isSubReady();
    rgbIn.sessionActive = localOperate.isSceneActive();
    rgbIn.operatorAuthOk = localOperate.isUnlocked() || signalRClient.isHubConnected();
#else
    rgbIn.operatorAuthOk = signalRClient.isHubConnected();
#endif
    rgbIn.motionActive =
        commandHandler.isMotionBusy() || commandHandler.isAutomaticProgramActive() ||
        executionContext.isActive();
    rgbStatusLed.poll(rgbIn);
    relayController.poll();
    motorController.poll();
    executionContext.poll();
    commandHandler.poll();
#if defined(SOMNET_STANDALONE) && SOMNET_STANDALONE
    localHistoryPoll();
#endif
    buttonInput.poll();

    if (!bannerPrinted && millis() >= 1500) {
        printSerialBanner();
        bannerPrinted = true;
    }

    yield();
}
