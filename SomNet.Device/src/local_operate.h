#pragma once

#include "config.h"

#include <stddef.h>
#include <stdint.h>

class AsyncWebServerRequest;
class NvsStore;
class SessionAccessoryController;

/** SomEsp: PIN unlock, Bearer session, local arm/disarm (GPIO32). */
class LocalOperate {
public:
    void begin(NvsStore* nvs, SessionAccessoryController* accessory);

    /** If newPin is non-empty after verify, stores operate_pin in NVS (trial plaintext). */
    bool unlockWithPin(
        const char* pin,
        const char* newPin,
        char* tokenOut,
        size_t tokenOutLen,
        uint64_t* expiresAtMsOut);
    void lock();

    bool isUnlocked() const;
    bool isArmed() const;
    uint64_t sessionExpiresAtMs() const;

    bool arm();
    bool disarm();

    /** True when Authorization: Bearer matches active session. */
    bool authorizeRequest(const AsyncWebServerRequest* request) const;

    /** Wi-Fi loss: disarm + lock (standalone safety SE-T8). */
    void onWifiDisconnected();

private:
    void clearSession();
    bool pinMatches(const char* pin) const;
    void mintSession(char* tokenOut, size_t tokenOutLen, uint64_t* expiresAtMsOut);

    NvsStore* nvs_ = nullptr;
    SessionAccessoryController* accessory_ = nullptr;
    char sessionToken_[kLocalOperateTokenHexLen + 1] = {};
    uint64_t sessionExpiresAtMs_ = 0;
    bool armed_ = false;
};

class ExecutionContext;
class WifiManager;

void registerLocalApiRoutes(class AsyncWebServer& server, LocalOperate* localOperate);
void localApiSetExecutionContext(ExecutionContext* ctx);
void localApiSetWifiManager(WifiManager* wifi);
void localApiSetCommandHandler(class CommandHandler* handler, class DeviceIdentity* identity);
