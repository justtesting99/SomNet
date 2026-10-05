#pragma once

#include <stddef.h>

/** Last local command ack for GET /api/local/status polling. */
void localCommandStatusBegin(const char* correlationId);
void localCommandStatusOnAck(
    const char* correlationId,
    bool success,
    const char* message,
    const char* resultJson);

void localCommandStatusGet(
    char* correlationIdOut,
    size_t correlationIdLen,
    bool* completeOut,
    bool* successOut,
    char* messageOut,
    size_t messageLen,
    char* resultJsonOut,
    size_t resultJsonLen);
