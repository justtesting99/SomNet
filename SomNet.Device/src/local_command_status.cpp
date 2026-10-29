#include "local_command_status.h"

#include "modes/automatic/automatic_config.h"
#include "modes/motor/motor_automatic_config.h"

#include <Arduino.h>
#include <stdlib.h>
#include <string.h>

namespace {

char gCorrelationId[64] = {};
bool gComplete = false;
bool gSuccess = false;
char gMessage[96] = {};
char gResultJson[768] = {};

constexpr size_t kMaxAutomaticSegmentSlots = 48;
constexpr size_t kAutomaticSegmentJsonMax = 220;

struct SegmentSlot {
    bool used = false;
    int index = -1;
    char json[kAutomaticSegmentJsonMax];
};

SegmentSlot gAutomaticSegments[kMaxAutomaticSegmentSlots];
size_t gAutomaticSegmentCount = 0;

bool isAutomaticSegmentCorrelation(const char* correlationId) {
    if (correlationId == nullptr) {
        return false;
    }
    return strcmp(correlationId, kRelayAutomaticSegmentCorrelationId) == 0 ||
           strcmp(correlationId, kMotorAutomaticSegmentCorrelationId) == 0;
}

int parseSegmentIndex(const char* resultJson) {
    if (resultJson == nullptr) {
        return -1;
    }
    const char* marker = strstr(resultJson, "\"segmentIndex\":");
    if (marker == nullptr) {
        return -1;
    }
    return atoi(marker + strlen("\"segmentIndex\":"));
}

} // namespace

void localAutomaticSegmentsClear() {
    for (size_t i = 0; i < kMaxAutomaticSegmentSlots; ++i) {
        gAutomaticSegments[i].used = false;
        gAutomaticSegments[i].index = -1;
        gAutomaticSegments[i].json[0] = '\0';
    }
    gAutomaticSegmentCount = 0;
}

void localAutomaticSegmentsCapture(const char* correlationId, const char* resultJson) {
    if (!isAutomaticSegmentCorrelation(correlationId) || resultJson == nullptr ||
        resultJson[0] == '\0') {
        return;
    }

    const int segmentIndex = parseSegmentIndex(resultJson);
    if (segmentIndex < 0 || segmentIndex >= static_cast<int>(kMaxAutomaticSegmentSlots)) {
        return;
    }

    if (segmentIndex == 0) {
        localAutomaticSegmentsClear();
    }

    SegmentSlot* slot = &gAutomaticSegments[static_cast<size_t>(segmentIndex)];
    if (!slot->used) {
        ++gAutomaticSegmentCount;
    }
    slot->used = true;
    slot->index = segmentIndex;
    strncpy(slot->json, resultJson, sizeof(slot->json) - 1);
    slot->json[sizeof(slot->json) - 1] = '\0';
}

size_t localAutomaticSegmentsCount() {
    size_t n = 0;
    for (size_t i = 0; i < kMaxAutomaticSegmentSlots; ++i) {
        if (gAutomaticSegments[i].used) {
            ++n;
        }
    }
    return n;
}

bool localAutomaticSegmentJsonAt(size_t ordinal, char* out, size_t outLen) {
    if (out == nullptr || outLen == 0) {
        return false;
    }
    out[0] = '\0';
    size_t seen = 0;
    for (size_t i = 0; i < kMaxAutomaticSegmentSlots; ++i) {
        if (!gAutomaticSegments[i].used) {
            continue;
        }
        if (seen == ordinal) {
            strncpy(out, gAutomaticSegments[i].json, outLen - 1);
            out[outLen - 1] = '\0';
            return true;
        }
        ++seen;
    }
    return false;
}

void localCommandStatusBegin(const char* correlationId) {
    gComplete = false;
    gSuccess = false;
    gMessage[0] = '\0';
    gResultJson[0] = '\0';
    if (correlationId != nullptr) {
        strncpy(gCorrelationId, correlationId, sizeof(gCorrelationId) - 1);
        gCorrelationId[sizeof(gCorrelationId) - 1] = '\0';
    } else {
        gCorrelationId[0] = '\0';
    }
}

void localCommandStatusOnAck(
    const char* correlationId,
    bool success,
    const char* message,
    const char* resultJson) {
    if (correlationId != nullptr && correlationId[0] != '\0') {
        strncpy(gCorrelationId, correlationId, sizeof(gCorrelationId) - 1);
        gCorrelationId[sizeof(gCorrelationId) - 1] = '\0';
    }
    gComplete = true;
    gSuccess = success;
    if (message != nullptr) {
        strncpy(gMessage, message, sizeof(gMessage) - 1);
        gMessage[sizeof(gMessage) - 1] = '\0';
    } else {
        gMessage[0] = '\0';
    }
    if (resultJson != nullptr && resultJson[0] != '\0') {
        strncpy(gResultJson, resultJson, sizeof(gResultJson) - 1);
        gResultJson[sizeof(gResultJson) - 1] = '\0';
    } else {
        gResultJson[0] = '\0';
    }

    if (isAutomaticSegmentCorrelation(correlationId)) {
        localAutomaticSegmentsCapture(correlationId, resultJson);
    } else if (correlationId != nullptr &&
               strcmp(correlationId, kAutomaticSessionCompleteCorrelationId) == 0) {
        // Keep segments through session end so the UI can render the full run; cleared on next index 0.
    }
}

void localCommandStatusGet(
    char* correlationIdOut,
    size_t correlationIdLen,
    bool* completeOut,
    bool* successOut,
    char* messageOut,
    size_t messageLen,
    char* resultJsonOut,
    size_t resultJsonLen) {
    if (correlationIdOut != nullptr && correlationIdLen > 0) {
        strncpy(correlationIdOut, gCorrelationId, correlationIdLen - 1);
        correlationIdOut[correlationIdLen - 1] = '\0';
    }
    if (completeOut != nullptr) {
        *completeOut = gComplete;
    }
    if (successOut != nullptr) {
        *successOut = gSuccess;
    }
    if (messageOut != nullptr && messageLen > 0) {
        strncpy(messageOut, gMessage, messageLen - 1);
        messageOut[messageLen - 1] = '\0';
    }
    if (resultJsonOut != nullptr && resultJsonLen > 0) {
        strncpy(resultJsonOut, gResultJson, resultJsonLen - 1);
        resultJsonOut[resultJsonLen - 1] = '\0';
    }
}
