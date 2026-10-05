#include "local_operate.h"

#include "config.h"
#include "execution_context.h"
#include "wifi_manager.h"

#include <ArduinoJson.h>
#include <ESPAsyncWebServer.h>

namespace {

LocalOperate* gLocalOperate = nullptr;
ExecutionContext* gExecutionContext = nullptr;
WifiManager* gWifi = nullptr;

void logLocalRequest(AsyncWebServerRequest* request, const char* path) {
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

    char token[kLocalOperateTokenHexLen + 1];
    uint64_t expiresAtMs = 0;
    if (!gLocalOperate->unlockWithPin(pin, token, sizeof(token), &expiresAtMs)) {
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
    if (!requireUnlocked(request)) {
        return;
    }
    gLocalOperate->lock();
    sendJson(request, 200, "{\"locked\":true}");
}

void handleLocalArm(AsyncWebServerRequest* request) {
    logLocalRequest(request, "/api/local/arm");
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
    if (!requireUnlocked(request)) {
        return;
    }
    gLocalOperate->disarm();
    sendJson(request, 200, "{\"armed\":false}");
}

void handleLocalStatus(AsyncWebServerRequest* request) {
    logLocalRequest(request, "/api/local/status");
    const bool unlocked = gLocalOperate != nullptr && gLocalOperate->isUnlocked();
    const bool armed = gLocalOperate != nullptr && gLocalOperate->isArmed();
    const bool busy = gExecutionContext != nullptr && gExecutionContext->isActive();
    const bool wifiConnected = gWifi != nullptr && gWifi->isConnected() && !gWifi->isSoftAp();

    char json[320];
    snprintf(
        json,
        sizeof(json),
        "{\"unlocked\":%s,\"armed\":%s,\"busy\":%s,\"wifiConnected\":%s,\"expiresAtMs\":%llu}",
        unlocked ? "true" : "false",
        armed ? "true" : "false",
        busy ? "true" : "false",
        wifiConnected ? "true" : "false",
        static_cast<unsigned long long>(unlocked ? gLocalOperate->sessionExpiresAtMs() : 0ULL));
    sendJson(request, 200, json);
}

void handleLocalCommands(AsyncWebServerRequest* request) {
    logLocalRequest(request, "/api/local/commands");
    if (gLocalOperate == nullptr || !gLocalOperate->authorizeRequest(request)) {
        sendJsonError(request, 401, "unauthorized");
        return;
    }
    if (!gLocalOperate->isArmed()) {
        sendJsonError(request, 403, "not_armed");
        return;
    }
    sendJsonError(request, 501, "not_implemented");
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
    server.on(
        "/api/local/commands",
        HTTP_POST,
        [](AsyncWebServerRequest* request) { handleLocalCommands(request); });
}

void localApiSetExecutionContext(ExecutionContext* ctx) {
    gExecutionContext = ctx;
}

void localApiSetWifiManager(WifiManager* wifi) {
    gWifi = wifi;
}
