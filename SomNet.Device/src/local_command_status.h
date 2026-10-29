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

/** Ring of automatic segment telemetry for live /operate graph (indexed by segmentIndex). */
void localAutomaticSegmentsClear();
void localAutomaticSegmentsCapture(const char* correlationId, const char* resultJson);
/** Append JSON array into out as `"automaticSegments":[...]` fragment or full merge via ArduinoJson helper. */
size_t localAutomaticSegmentsCount();
bool localAutomaticSegmentJsonAt(size_t ordinal, char* out, size_t outLen);
