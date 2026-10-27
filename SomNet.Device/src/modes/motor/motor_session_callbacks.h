#pragma once

/** Shared with relay automatic stop/notify (same hub ack shape). */
typedef void (*AutomaticCompleteCallback)(
    void* context,
    const char* correlationId,
    bool success,
    const char* message,
    const char* resultJson);
