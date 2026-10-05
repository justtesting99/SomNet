#include "local_history_store.h"

#if defined(SOMNET_STANDALONE) && SOMNET_STANDALONE

#include "nvs_store.h"
#include "wifi_manager.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <FS.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <string.h>
#include <time.h>

namespace {

constexpr char kHistoryDir[] = "/history";
constexpr char kIndexPath[] = "/history/index.json";
constexpr char kIndexTmpPath[] = "/history/index.tmp";

constexpr char kNvsHistNamespace[] = "somhist";
constexpr char kNvsKeyNextId[] = "next_id";

NvsStore* gNvs = nullptr;
WifiManager* gWifi = nullptr;
bool gFsReady = false;

struct PendingHistoryWrite {
    bool valid = false;
    char correlationId[64];
    bool success = false;
    char message[96];
    char resultJson[768];
};

PendingHistoryWrite gPending;

Preferences gHistPrefs;

static char sHistoryEventBuf[1200];
static char sHistoryIndexBuf[4096];

bool ensureHistoryDir() {
    if (!gFsReady) {
        return false;
    }
    if (!LittleFS.exists(kHistoryDir)) {
        return LittleFS.mkdir(kHistoryDir);
    }
    return true;
}

uint32_t readNextId() {
    if (!gHistPrefs.begin(kNvsHistNamespace, false)) {
        return 1;
    }
    const uint32_t id = gHistPrefs.getUInt(kNvsKeyNextId, 1);
    gHistPrefs.end();
    return id;
}

void writeNextId(uint32_t id) {
    if (!gHistPrefs.begin(kNvsHistNamespace, false)) {
        return;
    }
    gHistPrefs.putUInt(kNvsKeyNextId, id);
    gHistPrefs.end();
}

void buildSummary(const char* resultJson, char* out, size_t outLen) {
    out[0] = '\0';
    if (resultJson == nullptr || resultJson[0] == '\0' || outLen < 2) {
        strncpy(out, "event", outLen - 1);
        return;
    }

    JsonDocument doc;
    if (deserializeJson(doc, resultJson) != DeserializationError::Ok) {
        strncpy(out, "event", outLen - 1);
        return;
    }

    const char* key = doc["commandKey"] | "event";
    if (strcmp(key, "stroke") == 0 && doc["actualStrokeMs"].is<int>()) {
        snprintf(out, outLen, "stroke %dms", doc["actualStrokeMs"].as<int>());
        return;
    }
    if (strcmp(key, "burst") == 0 && doc["strokesCompleted"].is<int>()) {
        snprintf(
            out,
            outLen,
            "burst %d/%d",
            doc["strokesCompleted"].as<int>(),
            doc["requestedStrokes"] | doc["strokesCompleted"].as<int>());
        return;
    }
    if (strcmp(key, "automatic-stop") == 0 && doc["strokesCompleted"].is<int>()) {
        snprintf(out, outLen, "auto %d strokes", doc["strokesCompleted"].as<int>());
        return;
    }

    snprintf(out, outLen, "%s", key);
}

bool writeFile(const char* path, const char* data) {
    File f = LittleFS.open(path, "w");
    if (!f) {
        return false;
    }
    const size_t n = f.print(data);
    f.close();
    return n > 0;
}

bool flushPending() {
    if (!gPending.valid || !ensureHistoryDir()) {
        gPending.valid = false;
        return false;
    }

    const uint32_t id = readNextId();
    char idStr[12];
    snprintf(idStr, sizeof(idStr), "%lu", static_cast<unsigned long>(id));

    char summary[96];
    buildSummary(gPending.resultJson, summary, sizeof(summary));

    const unsigned long endedAtMs = millis();
    const bool timeSynced = gWifi != nullptr && gWifi->isTimeSynced();
    time_t nowSec = time(nullptr);
    char endedAtUtc[32] = {};
    if (timeSynced && nowSec > 100000) {
        struct tm tmUtc;
        if (gmtime_r(&nowSec, &tmUtc) != nullptr) {
            snprintf(
                endedAtUtc,
                sizeof(endedAtUtc),
                "%04d-%02d-%02dT%02d:%02d:%02dZ",
                tmUtc.tm_year + 1900,
                tmUtc.tm_mon + 1,
                tmUtc.tm_mday,
                tmUtc.tm_hour,
                tmUtc.tm_min,
                tmUtc.tm_sec);
        }
    }

    JsonDocument eventDoc;
    eventDoc["id"] = idStr;
    eventDoc["correlationId"] = gPending.correlationId;
    eventDoc["success"] = gPending.success;
    eventDoc["message"] = gPending.message;
    eventDoc["summary"] = summary;
    eventDoc["endedAtMs"] = endedAtMs;
    eventDoc["timeSynced"] = timeSynced;
    if (endedAtUtc[0] != '\0') {
        eventDoc["endedAtUtc"] = endedAtUtc;
    }
    if (gPending.resultJson[0] != '\0') {
        JsonDocument resultDoc;
        if (deserializeJson(resultDoc, gPending.resultJson) == DeserializationError::Ok) {
            eventDoc["result"] = resultDoc;
        } else {
            eventDoc["resultJson"] = gPending.resultJson;
        }
    }

    char eventPath[48];
    snprintf(eventPath, sizeof(eventPath), "/history/e%s.json", idStr);

    const size_t eventLen = serializeJson(eventDoc, sHistoryEventBuf, sizeof(sHistoryEventBuf));
    if (eventLen == 0 || eventLen >= sizeof(sHistoryEventBuf) || !writeFile(eventPath, sHistoryEventBuf)) {
        gPending.valid = false;
        return false;
    }

    JsonDocument indexDoc;
    if (LittleFS.exists(kIndexPath)) {
        File idx = LittleFS.open(kIndexPath, "r");
        if (idx) {
            deserializeJson(indexDoc, idx);
            idx.close();
        }
    }

    JsonDocument updated;
    JsonArray arr = updated["items"].to<JsonArray>();
    JsonObject row = arr.add<JsonObject>();
    row["id"] = idStr;
    row["correlationId"] = gPending.correlationId;
    row["success"] = gPending.success;
    row["summary"] = summary;
    row["endedAtMs"] = endedAtMs;
    if (endedAtUtc[0] != '\0') {
        row["endedAtUtc"] = endedAtUtc;
    }

    JsonArray oldItems = indexDoc["items"].as<JsonArray>();
    if (!oldItems.isNull()) {
        for (JsonVariant existing : oldItems) {
            if (arr.size() >= kLocalHistoryMaxSessions) {
                break;
            }
            arr.add(existing);
        }
    }

    while (arr.size() > kLocalHistoryMaxSessions) {
        JsonObject dropped = arr[kLocalHistoryMaxSessions];
        const char* dropId = dropped["id"] | "";
        if (dropId[0] != '\0') {
            char dropPath[48];
            snprintf(dropPath, sizeof(dropPath), "/history/e%s.json", dropId);
            LittleFS.remove(dropPath);
        }
        arr.remove(kLocalHistoryMaxSessions);
    }

    updated["nextId"] = id + 1;

    const size_t indexLen = serializeJson(updated, sHistoryIndexBuf, sizeof(sHistoryIndexBuf));
    if (indexLen == 0 || indexLen >= sizeof(sHistoryIndexBuf)) {
        gPending.valid = false;
        return false;
    }

    if (!writeFile(kIndexTmpPath, sHistoryIndexBuf)) {
        gPending.valid = false;
        return false;
    }
    LittleFS.remove(kIndexPath);
    LittleFS.rename(kIndexTmpPath, kIndexPath);

    writeNextId(id + 1);
    Serial.print(F("[HIST] saved event id="));
    Serial.println(idStr);

    gPending.valid = false;
    return true;
}

} // namespace

void localHistoryBegin(NvsStore* nvs, WifiManager* wifi) {
    gNvs = nvs;
    gWifi = wifi;
    gFsReady = LittleFS.begin(false);
    if (!gFsReady) {
        gFsReady = LittleFS.begin(true);
    }
    if (!gFsReady) {
        Serial.println(F("[HIST] LittleFS mount failed"));
        return;
    }
    ensureHistoryDir();
    Serial.println(F("[HIST] ready"));
}

void localHistoryPoll() {
    if (gPending.valid) {
        flushPending();
    }
}

void localHistoryClearAll() {
    if (!gFsReady) {
        return;
    }
    File root = LittleFS.open(kHistoryDir);
    if (root && root.isDirectory()) {
        File entry = root.openNextFile();
        while (entry) {
            const char* name = entry.name();
            if (name != nullptr && name[0] != '\0') {
                char path[64];
                snprintf(path, sizeof(path), "/history/%s", name);
                LittleFS.remove(path);
            }
            entry.close();
            entry = root.openNextFile();
        }
        root.close();
    }
    LittleFS.remove(kIndexPath);
    LittleFS.remove(kIndexTmpPath);
    writeNextId(1);
    gPending.valid = false;
    Serial.println(F("[HIST] cleared"));
}

void localHistoryOnLocalAck(
    const char* correlationId,
    bool success,
    const char* message,
    const char* resultJson) {
    if (!gFsReady) {
        return;
    }
    if (resultJson == nullptr || resultJson[0] == '\0') {
        return;
    }

    gPending.valid = true;
    strncpy(gPending.correlationId, correlationId != nullptr ? correlationId : "", sizeof(gPending.correlationId) - 1);
    gPending.correlationId[sizeof(gPending.correlationId) - 1] = '\0';
    gPending.success = success;
    if (message != nullptr) {
        strncpy(gPending.message, message, sizeof(gPending.message) - 1);
        gPending.message[sizeof(gPending.message) - 1] = '\0';
    } else {
        gPending.message[0] = '\0';
    }
    strncpy(gPending.resultJson, resultJson, sizeof(gPending.resultJson) - 1);
    gPending.resultJson[sizeof(gPending.resultJson) - 1] = '\0';
}

bool localHistoryWriteIndexJson(char* out, size_t outLen) {
    if (!gFsReady || outLen == 0) {
        return false;
    }
    if (!LittleFS.exists(kIndexPath)) {
        snprintf(out, outLen, "{\"items\":[]}");
        return true;
    }
    File f = LittleFS.open(kIndexPath, "r");
    if (!f) {
        return false;
    }
    size_t n = 0;
    while (f.available() && n + 1 < outLen) {
        const int c = f.read();
        if (c < 0) {
            break;
        }
        out[n++] = static_cast<char>(c);
    }
    out[n] = '\0';
    f.close();
    return n > 0;
}

bool localHistoryReadEventById(const char* id, char* out, size_t outLen) {
    if (!gFsReady || id == nullptr || id[0] == '\0' || outLen == 0) {
        return false;
    }
    char path[48];
    snprintf(path, sizeof(path), "/history/e%s.json", id);
    if (!LittleFS.exists(path)) {
        return false;
    }
    File f = LittleFS.open(path, "r");
    if (!f) {
        return false;
    }
    size_t n = 0;
    while (f.available() && n + 1 < outLen) {
        const int c = f.read();
        if (c < 0) {
            break;
        }
        out[n++] = static_cast<char>(c);
    }
    out[n] = '\0';
    f.close();
    return n > 0;
}

#endif
