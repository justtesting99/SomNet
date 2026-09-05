#include "config_pages.h"

#include "config.h"
#include "device_identity.h"
#include "nvs_store.h"
#include "wifi_manager.h"

#include <stdio.h>
#include <string.h>

namespace {

constexpr char kStyle[] PROGMEM = R"raw(
<style>
body{font-family:system-ui,sans-serif;margin:1rem;line-height:1.4;max-width:32rem}
h1{font-size:1.25rem}
label{display:block;margin-top:.75rem;font-weight:600}
input[type=text],input[type=password],input[type=url]{width:100%;box-sizing:border-box;padding:.5rem;margin-top:.25rem}
.readonly{background:#f3f3f3}
.device-id{font-family:monospace;font-size:1.1rem;word-break:break-all;user-select:all}
.note{color:#444;font-size:.9rem}
.actions{margin-top:1.25rem}
button{padding:.5rem 1rem}
a{color:#0366d6}
</style>
)raw";

void append(char* out, size_t outLen, size_t* offset, const char* text) {
    if (text == nullptr || *offset >= outLen) {
        return;
    }
    const size_t remaining = outLen - *offset;
    const int written = snprintf(out + *offset, remaining, "%s", text);
    if (written < 0) {
        return;
    }
    *offset += static_cast<size_t>(written);
    if (static_cast<size_t>(written) >= remaining) {
        *offset = outLen - 1;
        out[outLen - 1] = '\0';
    }
}

void appendProgmem(char* out, size_t outLen, size_t* offset, const char* progmemText) {
    char buffer[512];
    strncpy_P(buffer, progmemText, sizeof(buffer) - 1);
    buffer[sizeof(buffer) - 1] = '\0';
    append(out, outLen, offset, buffer);
}

void htmlEscape(const char* input, char* out, size_t outLen) {
    out[0] = '\0';
    if (input == nullptr || outLen < 2) {
        return;
    }

    size_t o = 0;
    for (size_t i = 0; input[i] != '\0' && o + 1 < outLen; ++i) {
        const unsigned char c = static_cast<unsigned char>(input[i]);
        if (c < 0x20 || c == 0x7F) {
            continue;
        }

        if (c > 0x7E) {
            char entity[12];
            snprintf(entity, sizeof(entity), "&#%u;", c);
            for (size_t e = 0; entity[e] != '\0' && o + 1 < outLen; ++e) {
                out[o++] = entity[e];
            }
            continue;
        }

        const char* rep = nullptr;
        char single[2] = {static_cast<char>(c), '\0'};
        if (c == '&') {
            rep = "&amp;";
        } else if (c == '<') {
            rep = "&lt;";
        } else if (c == '>') {
            rep = "&gt;";
        } else if (c == '"') {
            rep = "&quot;";
        }

        const char* src = rep != nullptr ? rep : single;
        while (*src && o + 1 < outLen) {
            out[o++] = *src++;
        }
    }
    out[o] = '\0';
}

} // namespace

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
    bool hubConnected) {
    size_t offset = 0;
    out[0] = '\0';

    char friendly[NvsStore::kMaxStringLen] = {};
    char installer[NvsStore::kMaxStringLen] = {};
    nvs.getFriendlyName(friendly, sizeof(friendly));
    nvs.getInstallerContact(installer, sizeof(installer));

    char escId[64];
    char escMac[32];
    char escFriendly[160];
    char escInstaller[160];
    char escServer[160];
    htmlEscape(identity.deviceId(), escId, sizeof(escId));
    htmlEscape(identity.macAddress(), escMac, sizeof(escMac));
    htmlEscape(friendly, escFriendly, sizeof(escFriendly));
    htmlEscape(installer, escInstaller, sizeof(escInstaller));
    htmlEscape(effectiveServerUrl != nullptr ? effectiveServerUrl : "", escServer, sizeof(escServer));

    append(out, outLen, &offset, "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>SomNet Device</title></head><body style=\"font-family:sans-serif;margin:1rem;color:#000;background:#fff;max-width:32rem;line-height:1.4\">");
    append(out, outLen, &offset, "<h1 style=\"font-size:1.25rem\">SomNet Device</h1>");

    if (provisioningMode) {
        append(out, outLen, &offset, "<p style=\"color:#444;font-size:.9rem\"><strong>Setup mode.</strong> Connect this device to your Wi-Fi and SomNet server.</p>");
    }

    append(out, outLen, &offset, "<p><strong>Device ID</strong> (pair in SomNet)</p><p style=\"font-family:monospace;font-size:1.1rem;word-break:break-all\">");
    append(out, outLen, &offset, escId);
    append(out, outLen, &offset, "</p><p style=\"color:#444;font-size:.9rem\">Dom account -&gt; select Sub -&gt; Pair device -&gt; paste this ID.</p>");

    if (escFriendly[0] != '\0') {
        append(out, outLen, &offset, "<p><strong>Friendly name:</strong> ");
        append(out, outLen, &offset, escFriendly);
        append(out, outLen, &offset, "</p>");
    }

    if (escInstaller[0] != '\0') {
        append(out, outLen, &offset, "<p><strong>Installer contact:</strong> ");
        append(out, outLen, &offset, escInstaller);
        append(out, outLen, &offset, "</p>");
    }

    append(out, outLen, &offset, "<p><strong>MAC:</strong> ");
    append(out, outLen, &offset, escMac);
    append(out, outLen, &offset, "</p><p><strong>Pairing:</strong> ");
    append(out, outLen, &offset, nvs.isPaired() ? "paired" : "not paired");
    append(out, outLen, &offset, "</p><p><strong>Wi-Fi:</strong> ");
    append(out, outLen, &offset, wifi.isConnected() ? (wifi.isSoftAp() ? "setup AP" : "connected") : "disconnected");
    append(out, outLen, &offset, "</p><p><strong>IP:</strong> ");
    append(out, outLen, &offset, wifi.localIp());
    append(out, outLen, &offset, "</p><p><strong>Server:</strong> ");
    append(out, outLen, &offset, escServer[0] != '\0' ? escServer : "(not configured)");
    append(out, outLen, &offset, "</p><p><strong>Hub:</strong> ");
    if (provisioningMode) {
        append(out, outLen, &offset, "off (provisioning)");
    } else if (hubConnected) {
        append(out, outLen, &offset, "connected (");
        append(out, outLen, &offset, hubStateLabel != nullptr ? hubStateLabel : "unknown");
        append(out, outLen, &offset, ")");
    } else {
        append(out, outLen, &offset, hubStateLabel != nullptr ? hubStateLabel : "offline");
    }
    append(out, outLen, &offset, "</p>");

    append(out, outLen, &offset, "<p><a href=\"/config\">Configure</a></p>");
    append(out, outLen, &offset, "</body></html>");
}

void renderConfigForm(
    char* out,
    size_t outLen,
    const NvsStore& nvs,
    const DeviceIdentity& identity,
    const char* effectiveServerUrl,
    bool provisioningMode) {
    size_t offset = 0;
    out[0] = '\0';

    char friendly[NvsStore::kMaxStringLen] = {};
    char installer[NvsStore::kMaxStringLen] = {};
    char wifiSsid[NvsStore::kMaxStringLen] = {};
    char wifiPass[NvsStore::kMaxStringLen] = {};
    char server[NvsStore::kMaxStringLen] = {};
    nvs.getFriendlyName(friendly, sizeof(friendly));
    nvs.getInstallerContact(installer, sizeof(installer));
    nvs.getWifiSsid(wifiSsid, sizeof(wifiSsid));
    nvs.getWifiPass(wifiPass, sizeof(wifiPass));
    if (wifiSsid[0] == '\0' && WIFI_SSID[0] != '\0') {
        strncpy(wifiSsid, WIFI_SSID, sizeof(wifiSsid) - 1);
        wifiSsid[sizeof(wifiSsid) - 1] = '\0';
    }
    if (!nvs.getServerUrl(server, sizeof(server)) && effectiveServerUrl != nullptr) {
        strncpy(server, effectiveServerUrl, sizeof(server) - 1);
        server[sizeof(server) - 1] = '\0';
    }

    char escId[64];
    char escFriendly[160];
    char escInstaller[160];
    char escSsid[80];
    char escPass[80];
    char escServer[160];
    htmlEscape(identity.deviceId(), escId, sizeof(escId));
    htmlEscape(friendly, escFriendly, sizeof(escFriendly));
    htmlEscape(installer, escInstaller, sizeof(escInstaller));
    htmlEscape(wifiSsid, escSsid, sizeof(escSsid));
    htmlEscape(wifiPass, escPass, sizeof(escPass));
    htmlEscape(server, escServer, sizeof(escServer));

    append(out, outLen, &offset, "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Configure SomNet Device</title></head><body style=\"font-family:sans-serif;margin:1rem;color:#000;background:#fff;max-width:32rem;line-height:1.4\">");
    append(out, outLen, &offset, "<h1 style=\"font-size:1.25rem\">Configure</h1>");
    if (provisioningMode) {
        append(out, outLen, &offset, "<p style=\"color:#444;font-size:.9rem\">Enter Wi-Fi and SomNet API base URL (no /hubs/hardware suffix).</p>");
    }

    append(out, outLen, &offset, "<form method=POST action=\"/config\">");
    append(out, outLen, &offset, "<p><label>Device ID<br><input style=\"width:100%;box-sizing:border-box;background:#f3f3f3\" type=text readonly value=\"");
    append(out, outLen, &offset, escId);
    append(out, outLen, &offset, "\"></label></p><p><label>Friendly name (optional)<br><input style=\"width:100%;box-sizing:border-box\" type=text name=friendly_name maxlength=64 value=\"");
    append(out, outLen, &offset, escFriendly);
    append(out, outLen, &offset, "\"></label></p><p><label>Installer contact (optional)<br><input style=\"width:100%;box-sizing:border-box\" type=text name=installer_contact maxlength=128 value=\"");
    append(out, outLen, &offset, escInstaller);
    append(out, outLen, &offset, "\"></label></p><p><label>Wi-Fi SSID<br><input style=\"width:100%;box-sizing:border-box\" required type=text name=wifi_ssid maxlength=32 value=\"");
    append(out, outLen, &offset, escSsid);
    append(out, outLen, &offset, "\"></label></p><p><label>Wi-Fi password<br><input style=\"width:100%;box-sizing:border-box\" required type=password name=wifi_pass maxlength=64 value=\"");
    append(out, outLen, &offset, escPass);
    append(out, outLen, &offset, "\"></label></p><p><label>SomNet server URL<br><input style=\"width:100%;box-sizing:border-box\" required type=url name=server_url placeholder=\"http://192.168.x.x:5031\" maxlength=128 value=\"");
    append(out, outLen, &offset, escServer);
    append(out, outLen, &offset, "\"></label></p><p style=\"color:#444;font-size:.9rem\">Example: http://192.168.1.100:5031</p><p><button type=submit>Save and reboot</button> <a href=\"/\">Cancel</a></p></form>");

    if (!provisioningMode) {
        append(out, outLen, &offset, "<form method=POST action=\"/config/reset-wifi\" style=\"margin-top:2rem\"><button type=submit>Reset Wi-Fi / server (re-provision)</button></form>");
        append(out, outLen, &offset, "<form method=POST action=\"/config/factory-reset\" style=\"margin-top:.5rem\" onsubmit=\"return confirm('Clear all settings including pairing?')\"><button type=submit>Factory reset</button></form>");
    }

    append(out, outLen, &offset, "</body></html>");
}

void renderSavedPage(char* out, size_t outLen, const char* message) {
    if (message == nullptr) {
        message = "Settings saved.";
    }

    char escMessage[160];
    htmlEscape(message, escMessage, sizeof(escMessage));

    size_t offset = 0;
    out[0] = '\0';
    append(out, outLen, &offset, "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta http-equiv=\"refresh\" content=\"5;url=/\"><title>Saved</title></head><body style=\"font-family:sans-serif;margin:1rem;color:#000;background:#fff;max-width:32rem;line-height:1.4\">");
    append(out, outLen, &offset, "<h1 style=\"font-size:1.25rem\">Saved</h1>");
    append(out, outLen, &offset, "<p style=\"padding:.75rem 1rem;background:#e8f4e8;border:1px solid #6aa86a;border-radius:.5rem\"><strong>Please wait for reboot.</strong><br>Your save was received. The device is restarting now — this usually takes 10–30 seconds.</p><p>");
    append(out, outLen, &offset, escMessage);
    append(out, outLen, &offset, "</p><p>Redirecting to the <a href=\"/\">status page</a> shortly…</p><p style=\"color:#444;font-size:.9rem\">If the status page does not load, wait for Wi-Fi to reconnect and open <a href=\"/\">/</a>.</p></body></html>");
}

} // namespace ConfigPages
