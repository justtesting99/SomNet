#pragma once

#include <stddef.h>
#include <stdint.h>

class NvsStore {
public:
    static constexpr size_t kMaxStringLen = 128;
    static constexpr size_t kDeviceIdLen = 32;

    bool begin();
    void end();
    bool isOpen() const { return open_; }

    void clearAll();
    void clearPairing();
    void clearProvisioning();

    // True when provisioned flag set and wifi_ssid + server_url stored
    bool isFullyProvisioned() const;

    // device_id
    bool getDeviceId(char* out, size_t outLen) const;
    bool setDeviceId(const char* value);

    // labels / contact
    bool getFriendlyName(char* out, size_t outLen) const;
    bool setFriendlyName(const char* value);
    bool getInstallerContact(char* out, size_t outLen) const;
    bool setInstallerContact(const char* value);

    // provisioning (Phase 3)
    bool getWifiSsid(char* out, size_t outLen) const;
    bool setWifiSsid(const char* value);
    bool getWifiPass(char* out, size_t outLen) const;
    bool setWifiPass(const char* value);
    bool getServerUrl(char* out, size_t outLen) const;
    bool setServerUrl(const char* value);
    bool getUseTls() const;
    bool setUseTls(bool value);
    bool isProvisioned() const;
    bool setProvisioned(bool value);

    // pairing (Phase 4)
    bool getAccessToken(char* out, size_t outLen) const;
    bool setAccessToken(const char* value);
    uint64_t getTokenExpires() const;
    bool setTokenExpires(uint64_t value);
    bool getDomTarget(char* out, size_t outLen) const;
    bool setDomTarget(const char* value);
    bool getSubTarget(char* out, size_t outLen) const;
    bool setSubTarget(const char* value);
    bool getPairedFlag() const;
    bool setPairedFlag(bool value);

    bool isPaired() const;

private:
    bool getString(const char* key, char* out, size_t outLen) const;
    bool setString(const char* key, const char* value);

    bool open_ = false;
};

// Set by main during setup for button credential reset
void nvsStoreSetInstance(NvsStore* store);
NvsStore* nvsStoreInstance();
