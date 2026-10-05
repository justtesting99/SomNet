#include "local_operate.h"

#include "command_handler.h"
#include "config.h"
#include "device_identity.h"
#include "execution_context.h"
#include "local_command_status.h"
#include "wifi_manager.h"

#include <ArduinoJson.h>
#include <ESPAsyncWebServer.h>

namespace {

LocalOperate* gLocalOperate = nullptr;
ExecutionContext* gExecutionContext = nullptr;
WifiManager* gWifi = nullptr;
CommandHandler* gCommandHandler = nullptr;
DeviceIdentity* gIdentity = nullptr;

void logLocalRequest(AsyncWebServerRequest* request, const char* path) {
    if (path != nullptr && strcmp(path, "/api/local/status") == 0) {
        static unsigned long lastStatusLogMs = 0;
        const unsigned long now = millis();
        if (now - lastStatusLogMs < 5000UL) {
            return;
        }
        lastStatusLogMs = now;
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

void sendJson(AsyncWebServerRequest* request, int code, const char* json) {
    request->send(code, "application/json", json);
}

void sendJsonError(AsyncWebServerRequest* request, int code, const char* error) {
    char body[96];
    snprintf(body, sizeof(body), "{\"error\":\"%s\"}", error);
    sendJson(request, code, body);
}

bool rejectLocalApiInSetupMode(AsyncWebServerRequest* request) {
    if (gWifi != nullptr && gWifi->isSoftAp()) {
        sendJsonError(request, 403, "setup_mode");
        return true;
    }
    return false;
}

bool requireUnlocked(AsyncWebServerRequest* request) {
    if (gLocalOperate == nullptr || !gLocalOperate->authorizeRequest(request)) {
        sendJsonError(request, 401, "unauthorized");
        return false;
    }
    return true;
}

struct JsonPostContext {
    const char* path;
    void (*onComplete)(AsyncWebServerRequest* request, const char* body, size_t len);
};

void handleJsonPost(
    AsyncWebServerRequest* request,
    uint8_t* data,
    size_t len,
    size_t index,
    size_t total,
    JsonPostContext* ctx) {
    if (ctx == nullptr) {
        return;
    }

    static String body;
    if (index == 0) {
        body = "";
        if (total > 512) {
            sendJsonError(request, 413, "body_too_large");
            return;
        }
    }

    for (size_t i = 0; i < len; ++i) {
        body += static_cast<char>(data[i]);
    }

    if (index + len < total) {
        return;
    }

    ctx->onComplete(request, body.c_str(), body.length());
}

void handleLocalUnlockBody(AsyncWebServerRequest* request, const char* body, size_t len) {
    if (rejectLocalApiInSetupMode(request)) {
        return;
    }

    JsonDocument doc;
    const DeserializationError err = deserializeJson(doc, body, len);
    if (err) {
        sendJsonError(request, 400, "invalid_json");
        return;
    }

    const char* pin = doc["pin"] | "";
    if (pin[0] == '\0') {
        sendJsonError(request, 400, "pin_required");
        return;
    }

    const char* newPin = doc["newPin"] | "";
    if (newPin[0] != '\0' && strlen(newPin) > kLocalOperatePinMaxLen) {
        sendJsonError(request, 400, "newPin_too_long");
        return;
    }

    char token[kLocalOperateTokenHexLen + 1];
    uint64_t expiresAtMs = 0;
    if (!gLocalOperate->unlockWithPin(pin, newPin, token, sizeof(token), &expiresAtMs)) {
        sendJsonError(request, 401, "invalid_pin");
        return;
    }

    char response[160];
    snprintf(
        response,
        sizeof(response),
        "{\"token\":\"%s\",\"expiresAtMs\":%llu,\"unlocked\":true}",
        token,
        static_cast<unsigned long long>(expiresAtMs));
    sendJson(request, 200, response);
}

void handleLocalUnlock(
    AsyncWebServerRequest* request,
    uint8_t* data,
    size_t len,
    size_t index,
    size_t total) {
    logLocalRequest(request, "/api/local/unlock");
    static JsonPostContext ctx = {"/api/local/unlock", handleLocalUnlockBody};
    handleJsonPost(request, data, len, index, total, &ctx);
}

void handleLocalLock(AsyncWebServerRequest* request) {
    logLocalRequest(request, "/api/local/lock");
    if (rejectLocalApiInSetupMode(request)) {
        return;
    }
    if (!requireUnlocked(request)) {
        return;
    }
    gLocalOperate->lock();
    sendJson(request, 200, "{\"locked\":true}");
}

void handleLocalArm(AsyncWebServerRequest* request) {
    logLocalRequest(request, "/api/local/arm");
    if (rejectLocalApiInSetupMode(request)) {
        return;
    }
    if (!requireUnlocked(request)) {
        return;
    }
    if (!gLocalOperate->arm()) {
        sendJsonError(request, 409, "arm_failed");
        return;
    }
    sendJson(request, 200, "{\"armed\":true}");
}

void handleLocalDisarm(AsyncWebServerRequest* request) {
    logLocalRequest(request, "/api/local/disarm");
    if (rejectLocalApiInSetupMode(request)) {
        return;
    }
    if (!requireUnlocked(request)) {
        return;
    }
    gLocalOperate->disarm();
    sendJson(request, 200, "{\"armed\":false}");
}

void handleLocalStatus(AsyncWebServerRequest* request) {
    logLocalRequest(request, "/api/local/status");
    if (rejectLocalApiInSetupMode(request)) {
        return;
    }
    const bool unlocked = gLocalOperate != nullptr && gLocalOperate->isUnlocked();
    const bool armed = gLocalOperate != nullptr && gLocalOperate->isArmed();
    const bool busy = gExecutionContext != nullptr && gExecutionContext->isActive();
    const bool automaticActive =
        gExecutionContext != nullptr && gExecutionContext->isAutomaticSessionActive();
    const bool wifiConnected = gWifi != nullptr && gWifi->isConnected() && !gWifi->isSoftAp();

    char correlationId[64];
    bool cmdComplete = false;
    bool cmdSuccess = false;
    char cmdMessage[96];
    char resultJson[768];
    localCommandStatusGet(
        correlationId,
        sizeof(correlationId),
        &cmdComplete,
        &cmdSuccess,
        cmdMessage,
        sizeof(cmdMessage),
        resultJson,
        sizeof(resultJson));

    JsonDocument doc;
    doc["unlocked"] = unlocked;
    doc["armed"] = armed;
    doc["busy"] = busy;
    doc["automaticActive"] = automaticActive;
    doc["wifiConnected"] = wifiConnected;
    doc["expiresAtMs"] = unlocked ? gLocalOperate->sessionExpiresAtMs() : 0ULL;
    doc["commandComplete"] = cmdComplete;
    doc["commandSuccess"] = cmdSuccess;
    if (correlationId[0] != '\0') {
        doc["lastCorrelationId"] = correlationId;
    }
    if (cmdMessage[0] != '\0') {
        doc["commandMessage"] = cmdMessage;
    }
    if (resultJson[0] != '\0') {
        doc["resultJson"] = resultJson;
    }

    char json[1400];
    const size_t n = serializeJson(doc, json, sizeof(json));
    if (n == 0 || n >= sizeof(json)) {
        sendJsonError(request, 500, "status_overflow");
        return;
    }
    sendJson(request, 200, json);
}

void handleLocalCaps(AsyncWebServerRequest* request) {
    logLocalRequest(request, "/api/local/caps");
    if (rejectLocalApiInSetupMode(request)) {
        return;
    }
    char json[160];
    snprintf(
        json,
        sizeof(json),
        "{\"maxStrokeMs\":%lu,\"maxBurstStrokes\":%d,\"maxBurstDelayMs\":%lu}",
        static_cast<unsigned long>(kMaxStrokeMs),
        kMaxBurstStrokes,
        static_cast<unsigned long>(kMaxBurstDelayMs));
    sendJson(request, 200, json);
}

bool dispatchLocalCommand(
    AsyncWebServerRequest* request,
    const char* commandKey,
    const char* payloadJson) {
    if (gCommandHandler == nullptr || gIdentity == nullptr) {
        sendJsonError(request, 503, "command_handler_unavailable");
        return false;
    }
    if (commandKey == nullptr || commandKey[0] == '\0') {
        sendJsonError(request, 400, "commandKey_required");
        return false;
    }

    ExecuteCommandPayload payload{};
    snprintf(payload.correlationId, sizeof(payload.correlationId), "local-%08lx", static_cast<unsigned long>(millis()));
    strncpy(payload.commandKey, commandKey, sizeof(payload.commandKey) - 1);
    strncpy(payload.deviceId, gIdentity->deviceId(), sizeof(payload.deviceId) - 1);
    strncpy(payload.payloadJson, payloadJson != nullptr ? payloadJson : "{}", sizeof(payload.payloadJson) - 1);
    payload.fromLocal = true;

    localCommandStatusBegin(payload.correlationId);
    gCommandHandler->enqueueExecuteCommand(payload);
    gCommandHandler->poll();

    char response[128];
    snprintf(
        response,
        sizeof(response),
        "{\"accepted\":true,\"correlationId\":\"%s\"}",
        payload.correlationId);
    sendJson(request, 200, response);
    return true;
}

void handleLocalCommandsBody(AsyncWebServerRequest* request, const char* body, size_t len) {
    JsonDocument doc;
    const DeserializationError err = deserializeJson(doc, body, len);
    if (err) {
        sendJsonError(request, 400, "invalid_json");
        return;
    }

    const char* commandKey = doc["commandKey"] | "";
    if (commandKey[0] == '\0') {
        sendJsonError(request, 400, "commandKey_required");
        return;
    }

    char payloadBuf[sizeof(ExecuteCommandPayload::payloadJson)];
    payloadBuf[0] = '\0';

    if (doc["payloadJson"].is<const char*>()) {
        strncpy(payloadBuf, doc["payloadJson"].as<const char*>(), sizeof(payloadBuf) - 1);
    } else if (doc["payloadJson"].is<JsonObject>() || doc["payloadJson"].is<JsonArray>()) {
        serializeJson(doc["payloadJson"], payloadBuf, sizeof(payloadBuf));
    } else {
        strncpy(payloadBuf, "{}", sizeof(payloadBuf) - 1);
    }

    dispatchLocalCommand(request, commandKey, payloadBuf);
}

void handleLocalCommandsPost(
    AsyncWebServerRequest* request,
    uint8_t* data,
    size_t len,
    size_t index,
    size_t total) {
    logLocalRequest(request, "/api/local/commands");
    if (rejectLocalApiInSetupMode(request)) {
        return;
    }
    if (gLocalOperate == nullptr || !gLocalOperate->authorizeRequest(request)) {
        sendJsonError(request, 401, "unauthorized");
        return;
    }
    if (!gLocalOperate->isArmed()) {
        sendJsonError(request, 403, "not_armed");
        return;
    }

    static String body;
    if (index == 0) {
        body = "";
        if (total > 2048) {
            sendJsonError(request, 413, "body_too_large");
            return;
        }
    }
    for (size_t i = 0; i < len; ++i) {
        body += static_cast<char>(data[i]);
    }
    if (index + len < total) {
        return;
    }

    handleLocalCommandsBody(request, body.c_str(), body.length());
}

} // namespace

void registerLocalApiRoutes(AsyncWebServer& server, LocalOperate* localOperate) {
    gLocalOperate = localOperate;

    server.on(
        "/api/local/unlock",
        HTTP_POST,
        [](AsyncWebServerRequest* request) {},
        nullptr,
        [](AsyncWebServerRequest* request, uint8_t* data, size_t len, size_t index, size_t total) {
            handleLocalUnlock(request, data, len, index, total);
        });

    server.on("/api/local/lock", HTTP_POST, [](AsyncWebServerRequest* request) { handleLocalLock(request); });
    server.on("/api/local/arm", HTTP_POST, [](AsyncWebServerRequest* request) { handleLocalArm(request); });
    server.on("/api/local/disarm", HTTP_POST, [](AsyncWebServerRequest* request) { handleLocalDisarm(request); });
    server.on("/api/local/status", HTTP_GET, [](AsyncWebServerRequest* request) { handleLocalStatus(request); });
    server.on("/api/local/caps", HTTP_GET, [](AsyncWebServerRequest* request) { handleLocalCaps(request); });
    server.on(
        "/api/local/commands",
        HTTP_POST,
        [](AsyncWebServerRequest* request) {},
        nullptr,
        [](AsyncWebServerRequest* request, uint8_t* data, size_t len, size_t index, size_t total) {
            handleLocalCommandsPost(request, data, len, index, total);
        });
}

void localApiSetExecutionContext(ExecutionContext* ctx) {
    gExecutionContext = ctx;
}

void localApiSetWifiManager(WifiManager* wifi) {
    gWifi = wifi;
}

void localApiSetCommandHandler(CommandHandler* handler, DeviceIdentity* identity) {
    gCommandHandler = handler;
    gIdentity = identity;
}
