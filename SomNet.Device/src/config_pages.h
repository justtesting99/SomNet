#pragma once

class DeviceIdentity;
class NvsStore;
class WifiManager;

#include <stddef.h>

namespace ConfigPages {

void renderStatus(
    char* out,
    size_t outLen,
    const NvsStore& nvs,
    const DeviceIdentity& identity,
    const WifiManager& wifi,
    const char* effectiveServerUrl,
    bool provisioningMode,
    const char* hubStateLabel,
    bool hubConnected);

void renderConfigForm(
    char* out,
    size_t outLen,
    const NvsStore& nvs,
    const DeviceIdentity& identity,
    const char* effectiveServerUrl,
    bool provisioningMode);

void renderSavedPage(char* out, size_t outLen, const char* message = "Settings saved.");

} // namespace ConfigPages
