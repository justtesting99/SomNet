#include "nvs_store.h"

#include <Arduino.h>
#include <Preferences.h>
#include <string.h>

namespace {

constexpr char kNamespace[] = "somnet";

// NVS key names must be <= 15 characters (ESP-IDF NVS_KEY_NAME_MAX_SIZE - 1).
constexpr char kKeyDeviceId[] = "device_id";
constexpr char kKeyFriendlyName[] = "friendly_name";
constexpr char kKeyInstallerContact[] = "installer";
constexpr char kKeyWifiSsid[] = "wifi_ssid";
constexpr char kKeyWifiPass[] = "wifi_pass";
constexpr char kKeyServerUrl[] = "server_url";
constexpr char kKeyUseTls[] = "use_tls";
constexpr char kKeyAccessToken[] = "access_token";
constexpr char kKeyTokenExpires[] = "token_expires";
constexpr char kKeyDomTarget[] = "dom_target";
constexpr char kKeySubTarget[] = "sub_target";
constexpr char kKeyPaired[] = "paired";
constexpr char kKeyProvisioned[] = "provisioned";

Preferences preferences;
NvsStore* gNvsStoreInstance = nullptr;

static bool isValidNvsKey(const char* key) {
    if (key == nullptr || key[0] == '\0') {
        return false;
    }
    return strlen(key) <= 15;
}

} // namespace

void nvsStoreSetInstance(NvsStore* store) {
    gNvsStoreInstance = store;
}

NvsStore* nvsStoreInstance() {
    return gNvsStoreInstance;
}

bool NvsStore::begin() {
    if (open_) {
        return true;
    }

    if (!preferences.begin(kNamespace, false)) {
        return false;
    }

    open_ = true;
    return true;
}

void NvsStore::end() {
    if (open_) {
        preferences.end();
        open_ = false;
    }
}

void NvsStore::clearAll() {
    if (!open_) {
        return;
    }
    preferences.clear();
}

void NvsStore::clearPairing() {
    setAccessToken("");
    setTokenExpires(0);
    setDomTarget("");
    setSubTarget("");
    setPairedFlag(false);
}

void NvsStore::clearProvisioning() {
    setWifiSsid("");
    setWifiPass("");
    setServerUrl("");
    setUseTls(false);
    setProvisioned(false);
}

bool NvsStore::getString(const char* key, char* out, size_t outLen) const {
    if (outLen == 0) {
        return false;
    }
    out[0] = '\0';
    if (!open_ || !isValidNvsKey(key)) {
        return false;
    }
    if (!preferences.isKey(key)) {
        return false;
    }

    String value = preferences.getString(key, "");
    strncpy(out, value.c_str(), outLen - 1);
    out[outLen - 1] = '\0';
    return true;
}

bool NvsStore::setString(const char* key, const char* value) {
    if (!open_ || !isValidNvsKey(key)) {
        Serial.print(F("[NVS] invalid key (max 15 chars): "));
        Serial.println(key != nullptr ? key : "(null)");
        return false;
    }
    // putString returns 0 for empty strings; that is still a successful write.
    preferences.putString(key, value != nullptr ? value : "");
    return true;
}

bool NvsStore::getDeviceId(char* out, size_t outLen) const {
    return getString(kKeyDeviceId, out, outLen);
}

bool NvsStore::setDeviceId(const char* value) {
    return setString(kKeyDeviceId, value);
}

bool NvsStore::getFriendlyName(char* out, size_t outLen) const {
    return getString(kKeyFriendlyName, out, outLen);
}

bool NvsStore::setFriendlyName(const char* value) {
    return setString(kKeyFriendlyName, value);
}

bool NvsStore::getInstallerContact(char* out, size_t outLen) const {
    return getString(kKeyInstallerContact, out, outLen);
}

bool NvsStore::setInstallerContact(const char* value) {
    return setString(kKeyInstallerContact, value);
}

bool NvsStore::getWifiSsid(char* out, size_t outLen) const {
    return getString(kKeyWifiSsid, out, outLen);
}

bool NvsStore::setWifiSsid(const char* value) {
    return setString(kKeyWifiSsid, value);
}

bool NvsStore::getWifiPass(char* out, size_t outLen) const {
    return getString(kKeyWifiPass, out, outLen);
}

bool NvsStore::setWifiPass(const char* value) {
    return setString(kKeyWifiPass, value);
}

bool NvsStore::getServerUrl(char* out, size_t outLen) const {
    return getString(kKeyServerUrl, out, outLen);
}

bool NvsStore::setServerUrl(const char* value) {
    return setString(kKeyServerUrl, value);
}

bool NvsStore::getUseTls() const {
    if (!open_) {
        return false;
    }
    return preferences.getBool(kKeyUseTls, false);
}

bool NvsStore::setUseTls(bool value) {
    if (!open_) {
        return false;
    }
    return preferences.putBool(kKeyUseTls, value) > 0;
}

bool NvsStore::isProvisioned() const {
    if (!open_) {
        return false;
    }
    return preferences.getBool(kKeyProvisioned, false);
}

bool NvsStore::setProvisioned(bool value) {
    if (!open_) {
        return false;
    }
    return preferences.putBool(kKeyProvisioned, value) > 0;
}

bool NvsStore::isFullyProvisioned() const {
    if (!isProvisioned()) {
        return false;
    }

    char wifi[NvsStore::kMaxStringLen];
    char server[NvsStore::kMaxStringLen];
    return getWifiSsid(wifi, sizeof(wifi)) && getServerUrl(server, sizeof(server));
}

bool NvsStore::getAccessToken(char* out, size_t outLen) const {
    return getString(kKeyAccessToken, out, outLen);
}

bool NvsStore::setAccessToken(const char* value) {
    return setString(kKeyAccessToken, value);
}

uint64_t NvsStore::getTokenExpires() const {
    if (!open_) {
        return 0;
    }
    return preferences.getULong64(kKeyTokenExpires, 0);
}

bool NvsStore::setTokenExpires(uint64_t value) {
    if (!open_) {
        return false;
    }
    return preferences.putULong64(kKeyTokenExpires, value) > 0;
}

bool NvsStore::getDomTarget(char* out, size_t outLen) const {
    return getString(kKeyDomTarget, out, outLen);
}

bool NvsStore::setDomTarget(const char* value) {
    return setString(kKeyDomTarget, value);
}

bool NvsStore::getSubTarget(char* out, size_t outLen) const {
    return getString(kKeySubTarget, out, outLen);
}

bool NvsStore::setSubTarget(const char* value) {
    return setString(kKeySubTarget, value);
}

bool NvsStore::getPairedFlag() const {
    if (!open_) {
        return false;
    }
    return preferences.getBool(kKeyPaired, false);
}

bool NvsStore::setPairedFlag(bool value) {
    if (!open_) {
        return false;
    }
    return preferences.putBool(kKeyPaired, value) > 0;
}

bool NvsStore::isPaired() const {
    if (!getPairedFlag()) {
        return false;
    }

    char token[16];
    return getAccessToken(token, sizeof(token));
}
