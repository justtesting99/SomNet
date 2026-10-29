#pragma once

/** Shared with relay automatic stop/notify (same hub ack shape). */
typedef void (*AutomaticCompleteCallback)(
    void* context,
    const char* correlationId,
    bool success,
    const char* message,
    const char* resultJson);

/** Unsolicited hub ack when a motor automatic ramp segment begins (commanded speeds). */
typedef void (*MotorAutomaticSegmentCallback)(void* context, const char* resultJson);
