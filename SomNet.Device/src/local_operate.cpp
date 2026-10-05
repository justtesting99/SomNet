#include "local_operate.h"

#include "nvs_store.h"
#include "session_accessory_controller.h"

#include <ESPAsyncWebServer.h>
#include <Arduino.h>
#include <esp_random.h>
#include <string.h>

namespace {

constexpr char kDefaultOperatePin[] = "1234";
constexpr size_t kTokenBytes = 32;

bool extractBearerToken(const AsyncWebServerRequest* request, char* out, size_t outLen) {
    out[0] = '\0';
    if (request == nullptr || outLen == 0) {
        return false;
    }

    const String auth = request->header("Authorization");
    if (!auth.startsWith("Bearer ")) {
        return false;
    }

    const char* token = auth.c_str() + 7;
    while (*token == ' ') {
        ++token;
    }
    if (token[0] == '\0') {
        return false;
    }

    strncpy(out, token, outLen - 1);
    out[outLen - 1] = '\0';
    return true;
}

void bytesToHex(const uint8_t* bytes, size_t len, char* out, size_t outLen) {
    if (outLen < len * 2 + 1) {
        out[0] = '\0';
        return;
    }
    static const char* hex = "0123456789abcdef";
    for (size_t i = 0; i < len; ++i) {
        out[i * 2] = hex[(bytes[i] >> 4) & 0x0F];
        out[i * 2 + 1] = hex[bytes[i] & 0x0F];
    }
    out[len * 2] = '\0';
}

} // namespace

void LocalOperate::begin(NvsStore* nvs, SessionAccessoryController* accessory) {
    nvs_ = nvs;
    accessory_ = accessory;
    clearSession();

    if (nvs_ == nullptr) {
        return;
    }

    if (!nvs_->hasOperatePin()) {
        Serial.println(F("[LOCAL] factory operate PIN: 1234 (change in a later release)"));
    }
}

bool LocalOperate::pinMatches(const char* pin) const {
    if (pin == nullptr || nvs_ == nullptr) {
        return false;
    }

    char expected[kLocalOperatePinMaxLen + 1] = {};
    if (!nvs_->getOperatePin(expected, sizeof(expected)) || expected[0] == '\0') {
        strncpy(expected, kDefaultOperatePin, sizeof(expected) - 1);
    }

    return strcmp(pin, expected) == 0;
}

void LocalOperate::mintSession(char* tokenOut, size_t tokenOutLen, uint64_t* expiresAtMsOut) {
    uint8_t raw[kTokenBytes];
    for (size_t i = 0; i < kTokenBytes; i += 4) {
        const uint32_t r = esp_random();
        memcpy(raw + i, &r, (i + 4 <= kTokenBytes) ? 4 : (kTokenBytes - i));
    }

    bytesToHex(raw, kTokenBytes, sessionToken_, sizeof(sessionToken_));
    sessionExpiresAtMs_ = static_cast<uint64_t>(millis()) + kLocalOperateTokenTtlMs;

    if (tokenOut != nullptr && tokenOutLen > 0) {
        strncpy(tokenOut, sessionToken_, tokenOutLen - 1);
        tokenOut[tokenOutLen - 1] = '\0';
    }
    if (expiresAtMsOut != nullptr) {
        *expiresAtMsOut = sessionExpiresAtMs_;
    }
}

void LocalOperate::clearSession() {
    sessionToken_[0] = '\0';
    sessionExpiresAtMs_ = 0;
    armed_ = false;
    if (accessory_ != nullptr) {
        accessory_->setEnabled(false);
    }
}

bool LocalOperate::unlockWithPin(
    const char* pin,
    const char* newPin,
    char* tokenOut,
    size_t tokenOutLen,
    uint64_t* expiresAtMsOut) {
    if (!pinMatches(pin)) {
        return false;
    }

    if (newPin != nullptr && newPin[0] != '\0' && nvs_ != nullptr) {
        if (strlen(newPin) > kLocalOperatePinMaxLen) {
            return false;
        }
        if (!nvs_->setOperatePin(newPin)) {
            return false;
        }
        Serial.println(F("[LOCAL] operate PIN updated in NVS"));
    }

    mintSession(tokenOut, tokenOutLen, expiresAtMsOut);
    Serial.println(F("[LOCAL] unlocked (Bearer session)"));
    return true;
}

void LocalOperate::lock() {
    Serial.println(F("[LOCAL] locked"));
    clearSession();
}

bool LocalOperate::isUnlocked() const {
    if (sessionToken_[0] == '\0') {
        return false;
    }
    if (sessionExpiresAtMs_ != 0 && static_cast<uint64_t>(millis()) > sessionExpiresAtMs_) {
        return false;
    }
    return true;
}

bool LocalOperate::isArmed() const {
    return armed_ && isUnlocked();
}

uint64_t LocalOperate::sessionExpiresAtMs() const {
    return isUnlocked() ? sessionExpiresAtMs_ : 0;
}

bool LocalOperate::arm() {
    if (!isUnlocked()) {
        return false;
    }
    if (accessory_ == nullptr) {
        return false;
    }

    if (!accessory_->setEnabled(true)) {
        return false;
    }
    armed_ = true;
    Serial.println(F("[LOCAL] armed"));
    return true;
}

bool LocalOperate::disarm() {
    armed_ = false;
    if (accessory_ != nullptr) {
        accessory_->setEnabled(false);
    }
    Serial.println(F("[LOCAL] disarmed"));
    return true;
}

bool LocalOperate::authorizeRequest(const AsyncWebServerRequest* request) const {
    if (!isUnlocked()) {
        return false;
    }

    char bearer[kLocalOperateTokenHexLen + 8];
    if (!extractBearerToken(request, bearer, sizeof(bearer))) {
        return false;
    }

    return strcmp(bearer, sessionToken_) == 0;
}

void LocalOperate::onWifiDisconnected() {
    if (!armed_ && sessionToken_[0] == '\0') {
        return;
    }
    Serial.println(F("[LOCAL] Wi-Fi lost — lock + disarm"));
    clearSession();
}
