#include <Arduino.h>

#include "config.h"

#include "button_input.h"
#include "command_handler.h"
#include "config_web_server.h"
#include "device_identity.h"
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

bool bannerPrinted = false;

void printSerialBanner() {
    Serial.println(F("========================================"));
    Serial.println(F(" SomNet Device Firmware"));
    Serial.print(F(" Version: "));
    Serial.println(FIRMWARE_VERSION);
    Serial.print(F(" Device ID: "));
    Serial.println(deviceIdentity.deviceId());
    Serial.print(F(" MAC: "));
    Serial.println(deviceIdentity.macAddress());
    Serial.print(F(" Pairing: "));
    Serial.println(nvsStore.isPaired() ? F("paired") : F("not paired"));
    Serial.print(F(" Wi-Fi: "));
    Serial.println(wifiManager.isConnected() ? F("connected") : F("disconnected / retrying"));
    Serial.print(F(" IP: "));
    Serial.println(wifiManager.localIp());
    Serial.print(F(" Server: "));
    if (SOMNET_SERVER_HOST[0] == '\0') {
        Serial.println(F("(not configured)"));
    } else {
        Serial.print(SOMNET_SERVER_HOST);
        Serial.print(':');
        Serial.println(SOMNET_SERVER_PORT);
    }
    Serial.println(F(" Log prefixes: [WIFI] [CMD] [RELAY] [BTN] [NVS] [ID]"));
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
    relayController.begin();
    executionContext.begin();
    commandHandler.begin();
    buttonInput.begin();
    signalRClient.begin();
    configWebServer.begin();

    wifiManager.begin(WIFI_SSID, WIFI_PASSWORD);
}

void loop() {
    wifiManager.poll();
    executionContext.poll();
    commandHandler.poll();
    buttonInput.poll();
    signalRClient.poll();
    configWebServer.poll();
    relayController.poll();

    if (!bannerPrinted && millis() >= 1500) {
        printSerialBanner();
        bannerPrinted = true;
    }

    delay(1);
}
