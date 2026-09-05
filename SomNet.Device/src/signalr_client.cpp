#include "signalr_client.h"

#include "command_handler.h"
#include "device_identity.h"
#include "nvs_store.h"
#include "wifi_manager.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WebSocketsClient.h>
#include <WiFi.h>

#include <ctype.h>
#include <mbedtls/base64.h>
#include <string.h>
#include <time.h>

namespace {

constexpr char kHubPath[] = "/hubs/hardware";
constexpr char kRecordSeparator = static_cast<char>(0x1E);

WebSocketsClient gWs;
SignalRClient* gActiveClient = nullptr;
NvsStore* gNvs = nullptr;
DeviceIdentity* gIdentity = nullptr;

char gConnectionToken[128] = {};
char gWsHost[96] = {};
uint16_t gWsPort = 5031;
char gRxBuffer[2048];
size_t gRxLen = 0;
bool gUsePairedConnect = false;
bool gHandshakeComplete = false;
bool gImmediateReconnect = false;
bool gSuppressDisconnectNotify = false;
uint32_t gAckInvocationCounter = 0;
unsigned long gHandshakeStartedMs = 0;
unsigned long gLastExpiryDiagMs = 0;
unsigned long gIgnorePairDeviceUntilMs = 0;

uint64_t parseExpiresAtMs(const char* iso);

uint64_t utcToUnixMs(int year, int month, int day, int hour, int minute, int second) {
    if (month <= 2) {
        year -= 1;
        month += 12;
    }

    const uint64_t era = static_cast<uint64_t>((year >= 0 ? year : year - 399) / 400);
    const unsigned yoe = static_cast<unsigned>(year - static_cast<int>(era * 400));
    const unsigned doy = (153U * static_cast<unsigned>(month - 3) + 2U) / 5U + static_cast<unsigned>(day - 1);
    const unsigned doe = yoe * 365U + yoe / 4U - yoe / 100U + doy;
    const int64_t days = static_cast<int64_t>(era * 146097ULL + doe) - 719468;
    const int64_t seconds = ((days * 24 + hour) * 60 + minute) * 60 + second;
    if (seconds < 0) {
        return 0;
    }
    return static_cast<uint64_t>(seconds) * 1000ULL;
}

bool decodeBase64UrlSegment(const char* input, char* out, size_t outLen, size_t* decodedLen) {
    if (input == nullptr || out == nullptr || decodedLen == nullptr || outLen == 0) {
        return false;
    }

    char normalized[NvsStore::kMaxTokenLen];
    size_t normalizedLen = 0;
    for (size_t i = 0; input[i] != '\0' && normalizedLen + 1 < sizeof(normalized); ++i) {
        const char c = input[i];
        if (c == '-') {
            normalized[normalizedLen++] = '+';
        } else if (c == '_') {
            normalized[normalizedLen++] = '/';
        } else {
            normalized[normalizedLen++] = c;
        }
    }

    while (normalizedLen % 4 != 0 && normalizedLen + 1 < sizeof(normalized)) {
        normalized[normalizedLen++] = '=';
    }
    normalized[normalizedLen] = '\0';

    size_t outputLength = 0;
    const int rc = mbedtls_base64_decode(
        reinterpret_cast<unsigned char*>(out),
        outLen - 1,
        &outputLength,
        reinterpret_cast<const unsigned char*>(normalized),
        normalizedLen);
    if (rc != 0) {
        return false;
    }

    out[outputLength] = '\0';
    *decodedLen = outputLength;
    return true;
}

uint64_t parseJwtExpMs(const char* jwt) {
    if (jwt == nullptr || jwt[0] == '\0') {
        return 0;
    }

    const char* firstDot = strchr(jwt, '.');
    if (firstDot == nullptr) {
        return 0;
    }
    const char* secondDot = strchr(firstDot + 1, '.');
    if (secondDot == nullptr) {
        return 0;
    }

    const size_t payloadLen = static_cast<size_t>(secondDot - (firstDot + 1));
    if (payloadLen == 0 || payloadLen >= NvsStore::kMaxTokenLen) {
        return 0;
    }

    char payloadSegment[NvsStore::kMaxTokenLen];
    memcpy(payloadSegment, firstDot + 1, payloadLen);
    payloadSegment[payloadLen] = '\0';

    char payloadJson[NvsStore::kMaxTokenLen];
    size_t decodedLen = 0;
    if (!decodeBase64UrlSegment(payloadSegment, payloadJson, sizeof(payloadJson), &decodedLen)) {
        return 0;
    }

    StaticJsonDocument<384> doc;
    if (deserializeJson(doc, payloadJson)) {
        return 0;
    }

    const uint64_t expSec = doc["exp"] | 0ULL;
    if (expSec == 0) {
        return 0;
    }
    return expSec * 1000ULL;
}

uint64_t resolveTokenExpiryMs(const char* expiresAtIso, const char* accessToken) {
    const uint64_t jwtExpMs = parseJwtExpMs(accessToken);
    if (jwtExpMs > 0) {
        return jwtExpMs;
    }

    return parseExpiresAtMs(expiresAtIso);
}

void logExpiryDiagnostics(NvsStore& nvs, WifiManager& wifi) {
    if (!nvs.isPaired() || !wifi.isTimeSynced()) {
        return;
    }

    const unsigned long nowMs = millis();
    if (nowMs - gLastExpiryDiagMs < 60000UL) {
        return;
    }
    gLastExpiryDiagMs = nowMs;

    const uint64_t expiresMs = nvs.getTokenExpires();
    const time_t nowSec = time(nullptr);
    if (expiresMs == 0 || nowSec <= 0) {
        Serial.println(F("[HUB] expiry diag: token_expires not set — re-pair after API restart"));
        return;
    }

    const int64_t remainingSec = static_cast<int64_t>(expiresMs / 1000ULL) - static_cast<int64_t>(nowSec);
    Serial.print(F("[HUB] expiry diag: remaining_s="));
    Serial.print(static_cast<long>(remainingSec));
    Serial.print(F(" (clears ~"));
    Serial.print(static_cast<long>(remainingSec - static_cast<int64_t>(TOKEN_EXPIRY_BUFFER_MS / 1000ULL)));
    Serial.println(F(" s with 5 min buffer)"));
}

void buildEffectiveServerUrl(NvsStore& nvs, char* out, size_t outLen) {
    out[0] = '\0';
    if (nvs.getServerUrl(out, outLen)) {
        return;
    }
    if (SOMNET_SERVER_HOST[0] != '\0') {
        snprintf(out, outLen, "http://%s:%d", SOMNET_SERVER_HOST, SOMNET_SERVER_PORT);
    }
}

bool hasHubServerConfig(NvsStore& nvs) {
    if (nvs.isFullyProvisioned()) {
        return true;
    }

    char serverUrl[NvsStore::kMaxStringLen];
    buildEffectiveServerUrl(nvs, serverUrl, sizeof(serverUrl));
    return serverUrl[0] != '\0';
}

bool isTokenExpiryReached(uint64_t expiresMs) {
    if (expiresMs == 0) {
        return false;
    }

    const time_t nowSec = time(nullptr);
    if (nowSec <= 0) {
        return false;
    }

    const uint64_t nowMs = static_cast<uint64_t>(nowSec) * 1000ULL;
    return nowMs + TOKEN_EXPIRY_BUFFER_MS >= expiresMs;
}

bool pairingTokenExpired(NvsStore& nvs, WifiManager& wifi) {
    if (!nvs.isPaired() || !wifi.isTimeSynced()) {
        return false;
    }

    return isTokenExpiryReached(nvs.getTokenExpires());
}

void clearExpiredPairing(NvsStore& nvs) {
    Serial.println(F("[HUB] token expired — clearing pairing"));
    nvs.clearPairing();
    gUsePairedConnect = false;
    gIgnorePairDeviceUntilMs = millis() + 10000;
}

bool tryClearExpiredPairing(NvsStore& nvs, WifiManager& wifi, SignalRClient* client) {
    if (!pairingTokenExpired(nvs, wifi)) {
        return false;
    }

    clearExpiredPairing(nvs);
    if (gWs.isConnected()) {
        gSuppressDisconnectNotify = true;
        gWs.disconnect();
    }
    if (client != nullptr) {
        client->onTransportLost(true);
    }
    return true;
}

void resetRxBuffer() {
    gRxLen = 0;
    gRxBuffer[0] = '\0';
}

void notifyTransportLost() {
    if (gActiveClient != nullptr) {
        gActiveClient->onTransportLost(gImmediateReconnect);
    }
    gImmediateReconnect = false;
}

void urlEncodeChar(char c, char* out, size_t outLen) {
    if (isalnum(static_cast<unsigned char>(c)) || c == '-' || c == '_' || c == '.' || c == '~') {
        out[0] = c;
        out[1] = '\0';
        return;
    }
    snprintf(out, outLen, "%%%02X", static_cast<unsigned char>(c));
}

void urlEncode(const char* input, char* out, size_t outLen) {
    out[0] = '\0';
    if (input == nullptr || outLen < 2) {
        return;
    }

    size_t offset = 0;
    for (size_t i = 0; input[i] != '\0' && offset + 1 < outLen; ++i) {
        char encoded[4];
        urlEncodeChar(input[i], encoded, sizeof(encoded));
        for (size_t j = 0; encoded[j] != '\0' && offset + 1 < outLen; ++j) {
            out[offset++] = encoded[j];
        }
    }
    out[offset] = '\0';
}

bool parseServerUrl(const char* url, char* hostOut, size_t hostLen, uint16_t* portOut, bool* tlsOut) {
    if (url == nullptr || hostOut == nullptr || portOut == nullptr || tlsOut == nullptr || hostLen == 0) {
        return false;
    }

    hostOut[0] = '\0';
    *portOut = 5031;
    *tlsOut = false;

    const char* cursor = url;
    if (strncmp(cursor, "https://", 8) == 0) {
        *tlsOut = true;
        cursor += 8;
        *portOut = 443;
    } else if (strncmp(cursor, "http://", 7) == 0) {
        cursor += 7;
    } else {
        return false;
    }

    const char* pathStart = strchr(cursor, '/');
    const char* hostEnd = pathStart != nullptr ? pathStart : cursor + strlen(cursor);
    const char* colon = static_cast<const char*>(memchr(cursor, ':', hostEnd - cursor));

    size_t hostCopyLen = 0;
    if (colon != nullptr) {
        hostCopyLen = static_cast<size_t>(colon - cursor);
        *portOut = static_cast<uint16_t>(atoi(colon + 1));
    } else {
        hostCopyLen = static_cast<size_t>(hostEnd - cursor);
    }

    if (hostCopyLen == 0 || hostCopyLen >= hostLen) {
        return false;
    }

    memcpy(hostOut, cursor, hostCopyLen);
    hostOut[hostCopyLen] = '\0';
    return true;
}

uint64_t parseExpiresAtMs(const char* iso) {
    if (iso == nullptr || iso[0] == '\0') {
        return 0;
    }

    int year = 0;
    int month = 0;
    int day = 0;
    int hour = 0;
    int minute = 0;
    int second = 0;
    if (sscanf(iso, "%d-%d-%dT%d:%d:%d", &year, &month, &day, &hour, &minute, &second) != 6) {
        return 0;
    }

    return utcToUnixMs(year, month, day, hour, minute, second);
}

bool negotiateConnectionToken(NvsStore& nvs, char* tokenOut, size_t tokenLen) {
    char serverUrl[NvsStore::kMaxStringLen];
    buildEffectiveServerUrl(nvs, serverUrl, sizeof(serverUrl));
    if (serverUrl[0] == '\0') {
        Serial.println(F("[HUB] no server URL — use /config or secrets.ini"));
        return false;
    }

    bool tls = false;
    if (!parseServerUrl(serverUrl, gWsHost, sizeof(gWsHost), &gWsPort, &tls)) {
        Serial.println(F("[HUB] invalid server_url"));
        return false;
    }
    if (tls || nvs.getUseTls()) {
        Serial.println(F("[HUB] TLS/wss not supported until Phase 7"));
        return false;
    }

    HTTPClient http;
    char negotiateUrl[192];
    snprintf(
        negotiateUrl,
        sizeof(negotiateUrl),
        "http://%s:%u/hubs/hardware/negotiate?negotiateVersion=1",
        gWsHost,
        gWsPort);

    http.begin(negotiateUrl);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(HUB_NEGOTIATE_TIMEOUT_MS);

    Serial.print(F("[HUB] negotiate "));
    Serial.println(negotiateUrl);

    const int status = http.POST("{}");
    if (status != HTTP_CODE_OK) {
        Serial.print(F("[HUB] negotiate failed status="));
        Serial.print(status);
        if (status < 0) {
            Serial.print(F(" ("));
            Serial.print(http.errorToString(status).c_str());
            Serial.print(F(")"));
        }
        Serial.println();
        if (status < 0) {
            Serial.println(F("[HUB] hint: same LAN subnet as API? API bound to 0.0.0.0:5031?"));
        }
        http.end();
        return false;
    }

    const String body = http.getString();
    http.end();

    StaticJsonDocument<768> doc;
    const DeserializationError err = deserializeJson(doc, body);
    if (err) {
        Serial.print(F("[HUB] negotiate JSON error: "));
        Serial.println(err.c_str());
        return false;
    }

    const char* token = doc["connectionToken"] | "";
    if (token[0] == '\0') {
        Serial.println(F("[HUB] negotiate missing connectionToken"));
        return false;
    }

    strncpy(tokenOut, token, tokenLen - 1);
    tokenOut[tokenLen - 1] = '\0';
    return true;
}

void sendHandshake() {
    gWs.sendTXT("{\"protocol\":\"json\",\"version\":1}\x1e");
    Serial.println(F("[HUB] handshake sent"));
}

void sendPong() {
    gWs.sendTXT("{\"type\":6}\x1e");
}

void handleHubFrame(const char* frame) {
    if (frame == nullptr) {
        return;
    }

    if (frame[0] == '\0' || strcmp(frame, "{}") == 0) {
        if (gActiveClient != nullptr) {
            gActiveClient->markHandshakeComplete();
        } else {
            gHandshakeComplete = true;
        }
        Serial.println(F("[HUB] handshake ok"));
        return;
    }

    StaticJsonDocument<1536> doc;
    const DeserializationError err = deserializeJson(doc, frame);
    if (err) {
        Serial.print(F("[HUB] JSON parse error: "));
        Serial.println(err.c_str());
        return;
    }

    const int type = doc["type"] | -1;
    if (type == 6) {
        sendPong();
        return;
    }

    if (type == 7) {
        if (gNvs != nullptr && gNvs->isPaired()) {
            Serial.println(F("[HUB] token rejected — unpaired"));
            gNvs->clearPairing();
            gUsePairedConnect = false;
            gImmediateReconnect = true;
        }
        gWs.disconnect();
        gHandshakeComplete = false;
        if (gActiveClient != nullptr) {
            gActiveClient->clearHandshakeState();
        }
        return;
    }

    if (type != 1) {
        return;
    }

    // Hub invocations only arrive after handshake; {} may be processed in a later frame.
    if (!gHandshakeComplete && gWs.isConnected()) {
        if (gActiveClient != nullptr) {
            gActiveClient->markHandshakeComplete();
        } else {
            gHandshakeComplete = true;
        }
        Serial.println(F("[HUB] handshake ok (implicit)"));
    }

    const char* target = doc["target"] | "";
    if (strcmp(target, "PairDevice") == 0) {
        JsonObject payload = doc["arguments"][0];
        if (payload.isNull()) {
            Serial.println(F("[HUB] PairDevice missing arguments"));
            return;
        }

        const char* deviceId = payload["deviceId"] | "";
        if (deviceId[0] == '\0' || gIdentity == nullptr || strcmp(deviceId, gIdentity->deviceId()) != 0) {
            Serial.println(F("[HUB] PairDevice deviceId mismatch — ignored"));
            return;
        }

        const char* accessToken = payload["accessToken"] | "";
        const char* domTarget = payload["domTarget"] | "";
        const char* subTarget = payload["subTarget"] | "";
        const char* expiresAt = payload["expiresAt"] | "";

        if (accessToken[0] == '\0' || gNvs == nullptr) {
            Serial.println(F("[HUB] PairDevice missing accessToken"));
            return;
        }

        if (millis() < gIgnorePairDeviceUntilMs) {
            Serial.println(F("[HUB] PairDevice ignored — cooldown after expiry clear"));
            return;
        }

        const uint64_t expiresMs = resolveTokenExpiryMs(expiresAt, accessToken);
        if (expiresMs == 0) {
            Serial.println(F("[HUB] PairDevice expiry unresolved — expiry check disabled until re-pair"));
        } else {
            Serial.print(F("[HUB] token_expires_s="));
            Serial.println(static_cast<unsigned long>(expiresMs / 1000ULL));
            if (isTokenExpiryReached(expiresMs)) {
                Serial.println(F("[HUB] PairDevice token within expiry buffer — ignored; re-pair from UI"));
                return;
            }
        }
        if (!gNvs->savePairing(accessToken, domTarget, subTarget, expiresMs)) {
            Serial.println(F("[HUB] failed to save pairing to NVS"));
            return;
        }

        Serial.print(F("[HUB] paired dom="));
        Serial.print(domTarget);
        Serial.print(F(" sub="));
        Serial.println(subTarget);

        gUsePairedConnect = true;
        gHandshakeComplete = false;
        gImmediateReconnect = true;
        gSuppressDisconnectNotify = true;
        gWs.disconnect();
        return;
    }

    if (strcmp(target, "ExecuteCommand") == 0) {
        JsonObject payload = doc["arguments"][0];
        if (payload.isNull()) {
            Serial.println(F("[HUB] ExecuteCommand missing arguments"));
            return;
        }

        ExecuteCommandPayload command = {};
        strncpy(command.correlationId, payload["correlationId"] | "", sizeof(command.correlationId) - 1);
        strncpy(command.commandKey, payload["commandKey"] | "", sizeof(command.commandKey) - 1);
        strncpy(command.accessToken, payload["accessToken"] | "", sizeof(command.accessToken) - 1);
        strncpy(command.domTarget, payload["domTarget"] | "", sizeof(command.domTarget) - 1);
        strncpy(command.subTarget, payload["subTarget"] | "", sizeof(command.subTarget) - 1);
        strncpy(command.deviceId, payload["deviceId"] | "", sizeof(command.deviceId) - 1);
        strncpy(command.payloadJson, payload["payloadJson"] | "{}", sizeof(command.payloadJson) - 1);
        command.correlationId[sizeof(command.correlationId) - 1] = '\0';
        command.commandKey[sizeof(command.commandKey) - 1] = '\0';
        command.accessToken[sizeof(command.accessToken) - 1] = '\0';
        command.domTarget[sizeof(command.domTarget) - 1] = '\0';
        command.subTarget[sizeof(command.subTarget) - 1] = '\0';
        command.deviceId[sizeof(command.deviceId) - 1] = '\0';
        command.payloadJson[sizeof(command.payloadJson) - 1] = '\0';

        commandHandlerOnExecuteCommand(command);
        return;
    }
}

void processIncomingText(const uint8_t* data, size_t len) {
    for (size_t i = 0; i < len; ++i) {
        const char c = static_cast<char>(data[i]);
        if (c == kRecordSeparator) {
            gRxBuffer[gRxLen] = '\0';
            handleHubFrame(gRxBuffer);
            gRxLen = 0;
            continue;
        }

        if (gRxLen + 1 >= sizeof(gRxBuffer)) {
            Serial.println(F("[HUB] RX buffer overflow — resetting"));
            gRxLen = 0;
            continue;
        }

        gRxBuffer[gRxLen++] = c;
    }
}

bool buildWebSocketPath(NvsStore& nvs, DeviceIdentity& identity, char* pathOut, size_t pathLen) {
    if (gUsePairedConnect && nvs.isPaired()) {
        char token[NvsStore::kMaxTokenLen];
        if (!nvs.getAccessToken(token, sizeof(token))) {
            return false;
        }
        char encoded[NvsStore::kMaxTokenLen * 3];
        urlEncode(token, encoded, sizeof(encoded));
        return snprintf(
                   pathOut,
                   pathLen,
                   "%s?id=%s&access_token=%s",
                   kHubPath,
                   gConnectionToken,
                   encoded) > 0;
    }

    return snprintf(
               pathOut,
               pathLen,
               "%s?id=%s&deviceId=%s",
               kHubPath,
               gConnectionToken,
               identity.deviceId()) > 0;
}

bool startWebSocket(NvsStore& nvs, DeviceIdentity& identity) {
    char path[1600];
    if (!buildWebSocketPath(nvs, identity, path, sizeof(path))) {
        Serial.println(F("[HUB] failed to build websocket path"));
        return false;
    }

    Serial.print(F("[HUB] connect ws://"));
    Serial.print(gWsHost);
    Serial.print(':');
    Serial.print(gWsPort);
    Serial.println(path);

    gWs.disconnect();
    gWs.begin(gWsHost, gWsPort, path);
    return true;
}

void onWebSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
    case WStype_DISCONNECTED:
        Serial.println(F("[HUB] websocket disconnected"));
        resetRxBuffer();
        gHandshakeComplete = false;
        gHandshakeStartedMs = 0;
        if (gActiveClient != nullptr) {
            gActiveClient->clearHandshakeState();
        }
        if (gSuppressDisconnectNotify) {
            gSuppressDisconnectNotify = false;
        } else {
            notifyTransportLost();
        }
        break;
    case WStype_CONNECTED:
        Serial.println(F("[HUB] websocket connected"));
        resetRxBuffer();
        gHandshakeComplete = false;
        gHandshakeStartedMs = millis();
        sendHandshake();
        break;
    case WStype_TEXT:
        processIncomingText(payload, length);
        break;
    default:
        break;
    }
}

} // namespace

bool SignalRClient::begin(NvsStore* nvsStore, DeviceIdentity* identity, WifiManager* wifi) {
    if (nvsStore == nullptr || identity == nullptr || wifi == nullptr) {
        return false;
    }

    nvs_ = nvsStore;
    identity_ = identity;
    wifi_ = wifi;
    gNvs = nvsStore;
    gIdentity = identity;
    gActiveClient = this;
    gUsePairedConnect = nvs_->isPaired();
    initialized_ = true;
    state_ = HubConnectionState::Offline;
    nextAttemptMs_ = 0;
    backoffMs_ = HUB_RETRY_BASE_MS;
    handshakeComplete_ = false;
    pendingConnect_ = false;

    gWs.onEvent(onWebSocketEvent);
    gWs.setReconnectInterval(0);
    gWs.enableHeartbeat(0, 0, 0);

    return true;
}

const char* SignalRClient::hubStateLabel() const {
    switch (state_) {
    case HubConnectionState::Offline:
        return "offline";
    case HubConnectionState::Backoff:
        return "backoff";
    case HubConnectionState::Negotiating:
        return "negotiating";
    case HubConnectionState::Connecting:
        return "connecting";
    case HubConnectionState::Handshaking:
        return "handshaking";
    case HubConnectionState::Unpaired:
        return "unpaired";
    case HubConnectionState::Paired:
        return "paired";
    default:
        return "unknown";
    }
}

bool SignalRClient::isHubConnected() const {
    return gWs.isConnected() && handshakeComplete_;
}

void SignalRClient::markHandshakeComplete() {
    handshakeComplete_ = true;
    gHandshakeComplete = true;
    if (nvs_ != nullptr && nvs_->isPaired()) {
        state_ = HubConnectionState::Paired;
    } else {
        state_ = HubConnectionState::Unpaired;
    }
}

void SignalRClient::clearHandshakeState() {
    handshakeComplete_ = false;
    gHandshakeComplete = false;
}

void SignalRClient::poll() {
    if (!initialized_ || nvs_ == nullptr || identity_ == nullptr || wifi_ == nullptr) {
        return;
    }

    if (wifi_->isSoftAp() || !wifi_->isConnected() || !hasHubServerConfig(*nvs_)) {
        if (state_ != HubConnectionState::Offline) {
            gWs.disconnect();
            state_ = HubConnectionState::Offline;
            handshakeComplete_ = false;
            pendingConnect_ = false;
        }
        gWs.loop();
        return;
    }

    gWs.loop();
    handshakeComplete_ = gHandshakeComplete;

    if (nvs_->isPaired() && !wifi_->isTimeSynced()) {
        static bool loggedWaitingForSntp = false;
        if (!loggedWaitingForSntp) {
            loggedWaitingForSntp = true;
            Serial.println(F("[HUB] waiting for SNTP before paired hub connect"));
        }
        state_ = HubConnectionState::Backoff;
        return;
    }

    if (nvs_->isPaired()) {
        logExpiryDiagnostics(*nvs_, *wifi_);
        if (tryClearExpiredPairing(*nvs_, *wifi_, this)) {
            return;
        }
    }

    if (gWs.isConnected() && handshakeComplete_) {
        gHandshakeStartedMs = 0;
        state_ = (gUsePairedConnect && nvs_->isPaired()) ? HubConnectionState::Paired : HubConnectionState::Unpaired;
        pendingConnect_ = false;
        return;
    }

    if (gWs.isConnected()) {
        if (gHandshakeStartedMs != 0 && millis() - gHandshakeStartedMs >= HUB_HANDSHAKE_TIMEOUT_MS) {
            Serial.println(F("[HUB] handshake timeout — reconnecting"));
            gSuppressDisconnectNotify = true;
            gWs.disconnect();
            onTransportLost(false);
            return;
        }
        state_ = HubConnectionState::Handshaking;
        return;
    }

    gHandshakeStartedMs = 0;

    if (pendingConnect_) {
        state_ = HubConnectionState::Connecting;
        return;
    }

    if (millis() < nextAttemptMs_) {
        state_ = HubConnectionState::Backoff;
        return;
    }

    state_ = HubConnectionState::Negotiating;
    handshakeComplete_ = false;

    if (!negotiateConnectionToken(*nvs_, gConnectionToken, sizeof(gConnectionToken))) {
        Serial.print(F("[HUB] retry in "));
        Serial.print(backoffMs_ / 1000);
        Serial.println(F(" s"));
        nextAttemptMs_ = millis() + backoffMs_;
        backoffMs_ = min(backoffMs_ * 2, HUB_RETRY_MAX_MS);
        state_ = HubConnectionState::Backoff;
        return;
    }

    backoffMs_ = HUB_RETRY_BASE_MS;
    pendingConnect_ = true;
    state_ = HubConnectionState::Connecting;

    if (!startWebSocket(*nvs_, *identity_)) {
        pendingConnect_ = false;
        nextAttemptMs_ = millis() + backoffMs_;
        backoffMs_ = min(backoffMs_ * 2, HUB_RETRY_MAX_MS);
        state_ = HubConnectionState::Backoff;
    }
}

void SignalRClient::onTransportLost(bool immediateRetry) {
    pendingConnect_ = false;
    clearHandshakeState();
    if (immediateRetry) {
        nextAttemptMs_ = 0;
        backoffMs_ = HUB_RETRY_BASE_MS;
    } else {
        nextAttemptMs_ = millis() + backoffMs_;
        backoffMs_ = min(backoffMs_ * 2, HUB_RETRY_MAX_MS);
    }
}

bool SignalRClient::sendAckCommand(const char* correlationId, bool success, const char* message) {
    if (correlationId == nullptr || correlationId[0] == '\0') {
        return false;
    }
    if (!gWs.isConnected() || !handshakeComplete_) {
        Serial.println(F("[HUB] AckCommand skipped - hub not ready"));
        return false;
    }

    ++gAckInvocationCounter;
    char invocationId[12];
    snprintf(invocationId, sizeof(invocationId), "%lu", static_cast<unsigned long>(gAckInvocationCounter));

    StaticJsonDocument<512> doc;
    doc["type"] = 1;
    doc["target"] = "AckCommand";
    doc["invocationId"] = invocationId;

    JsonArray args = doc["arguments"].to<JsonArray>();
    JsonObject ack = args.add<JsonObject>();
    ack["correlationId"] = correlationId;
    ack["success"] = success;
    ack["message"] = message != nullptr ? message : "";

    char buffer[512];
    const size_t jsonLen = serializeJson(doc, buffer, sizeof(buffer) - 2);
    if (jsonLen == 0 || jsonLen >= sizeof(buffer) - 2) {
        Serial.println(F("[HUB] AckCommand JSON too large"));
        return false;
    }

    buffer[jsonLen] = kRecordSeparator;
    buffer[jsonLen + 1] = '\0';
    gWs.sendTXT(buffer);

    Serial.println(F("[HUB] AckCommand sent"));
    return true;
}
