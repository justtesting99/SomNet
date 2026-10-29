#include "local_command_status.h"

#include <Arduino.h>
#include <string.h>

namespace {

char gCorrelationId[64] = {};
bool gComplete = false;
bool gSuccess = false;
char gMessage[96] = {};
char gResultJson[768] = {};

} // namespace

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
