#pragma once

#include <stddef.h>

class NvsStore;
class WifiManager;

#if defined(SOMNET_STANDALONE) && SOMNET_STANDALONE

constexpr size_t kLocalHistoryMaxSessions = 30;

void localHistoryBegin(NvsStore* nvs, WifiManager* wifi);
void localHistoryPoll();
void localHistoryClearAll();

/** Queue + flush on poll; called from local command ack path. */
void localHistoryOnLocalAck(
    const char* correlationId,
    bool success,
    const char* message,
    const char* resultJson);

/** Serialize index JSON into out (returns false if FS unavailable). */
bool localHistoryWriteIndexJson(char* out, size_t outLen);

/** Read one event file into out (JSON object). */
bool localHistoryReadEventById(const char* id, char* out, size_t outLen);

#else

inline void localHistoryBegin(NvsStore*, WifiManager*) {}
inline void localHistoryPoll() {}
inline void localHistoryClearAll() {}
inline void localHistoryOnLocalAck(const char*, bool, const char*, const char*) {}
inline bool localHistoryWriteIndexJson(char*, size_t) { return false; }
inline bool localHistoryReadEventById(const char*, char*, size_t) { return false; }

#endif
