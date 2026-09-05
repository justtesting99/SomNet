#include "config_pages.h"

#include "config.h"
#include "device_identity.h"
#include "nvs_store.h"
#include "wifi_manager.h"

#include <Arduino.h>

namespace {

// Phase 7 (P7-D10): SomNet web app palette — slate-950 / slate-900 / indigo-600
constexpr char kStyle[] PROGMEM = R"raw(
<style>
*{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI",system-ui,sans-serif;background:#020617;color:#cbd5e1;line-height:1.45;min-height:100vh;-webkit-font-smoothing:antialiased}
.page{max-width:32rem;margin:0 auto;padding:1rem 1rem 2rem}
h1{font-size:1.25rem;color:#f1f5f9;margin:0 0 .75rem;font-weight:600}
.panel{background:#0f172a;border:1px solid #334155;border-radius:.75rem;padding:1rem;margin:.75rem 0}
.note{color:#94a3b8;font-size:.875rem;margin:.5rem 0}
label{display:block;margin:.75rem 0 .35rem;font-weight:600;color:#e2e8f0;font-size:.875rem}
input[type=text],input[type=password],input[type=url]{width:100%;padding:.55rem .65rem;border:1px solid #475569;border-radius:.5rem;background:#1e293b;color:#f8fafc;font-size:1rem}
input:read-only{background:#334155;color:#cbd5e1}
.device-id{font-family:ui-monospace,monospace;font-size:1.05rem;word-break:break-all;user-select:all;color:#a5b4fc;padding:.65rem;background:#1e293b;border-radius:.5rem;border:1px solid #4338ca;margin:.35rem 0}
.row{margin:.4rem 0}
.row strong{color:#e2e8f0}
a{color:#818cf8;text-decoration:none}
a:hover{text-decoration:underline}
.actions{margin-top:1rem;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
button,.btn{display:inline-block;padding:.55rem 1rem;border-radius:.5rem;border:1px solid transparent;font-size:.9375rem;font-weight:600;cursor:pointer;font-family:inherit}
.btn-primary{background:#4f46e5;color:#fff}
.btn-primary:hover{background:#6366f1}
.btn-primary:disabled{background:#334155;color:#64748b;cursor:not-allowed;opacity:.85}
.btn-primary:disabled:hover{background:#334155}
.btn-secondary{background:#334155;color:#e2e8f0;border-color:#475569}
.btn-danger{background:#7f1d1d;color:#fecaca;border-color:#991b1b}
.alert-success{padding:.75rem 1rem;background:rgba(79,70,229,.15);border:1px solid #4f46e5;border-radius:.5rem;color:#e0e7ff;margin:.75rem 0}
.danger-zone{margin-top:1.5rem;padding-top:1rem;border-top:1px solid #334155}
.danger-zone .note{margin-bottom:.5rem}
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

void appendProgmemStr(char* out, size_t outLen, size_t* offset, const char* progmemText) {
    if (progmemText == nullptr || *offset >= outLen) {
        return;
    }
    for (size_t i = 0;; ++i) {
        const char c = static_cast<char>(pgm_read_byte(progmemText + i));
        if (c == '\0') {
            break;
        }
        if (*offset + 1 >= outLen) {
            out[outLen - 1] = '\0';
            return;
        }
        out[(*offset)++] = c;
    }
    out[*offset] = '\0';
}

void appendProgmem(char* out, size_t outLen, size_t* offset, const char* progmemText) {
    char buffer[768];
    strncpy_P(buffer, progmemText, sizeof(buffer) - 1);
    buffer[sizeof(buffer) - 1] = '\0';
    append(out, outLen, offset, buffer);
}

void appendHtmlHead(char* out, size_t outLen, size_t* offset, const char* title) {
    append(out, outLen, offset, "<!DOCTYPE html><html><head><meta charset=\"utf-8\">");
    append(out, outLen, offset, "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">");
    append(out, outLen, offset, "<title>");
    append(out, outLen, offset, title);
    append(out, outLen, offset, "</title>");
    appendProgmemStr(out, outLen, offset, kStyle);
    append(out, outLen, offset, "</head><body><div class=\"page\">");
}

void appendHtmlFoot(char* out, size_t outLen, size_t* offset) {
    append(out, outLen, offset, "</div></body></html>");
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

    appendHtmlHead(out, outLen, &offset, "SomNet Device");
    append(out, outLen, &offset, "<h1>SomNet Device</h1>");

    if (provisioningMode) {
        append(out, outLen, &offset, "<div class=\"panel note\"><strong>Setup mode.</strong> Connect this device to your Wi-Fi and SomNet server.</div>");
    }

    append(out, outLen, &offset, "<div class=\"panel\"><p><strong>Device ID</strong> (pair in SomNet)</p><div class=\"device-id\">");
    append(out, outLen, &offset, escId);
    append(out, outLen, &offset, "</div><p class=\"note\">Dom account &rarr; select Sub &rarr; Options &rarr; Hardware device &rarr; paste this ID.</p></div>");

    if (escFriendly[0] != '\0' || escInstaller[0] != '\0') {
        append(out, outLen, &offset, "<div class=\"panel\">");
        if (escFriendly[0] != '\0') {
            append(out, outLen, &offset, "<p class=\"row\"><strong>Friendly name:</strong> ");
            append(out, outLen, &offset, escFriendly);
            append(out, outLen, &offset, "</p>");
        }
        if (escInstaller[0] != '\0') {
            append(out, outLen, &offset, "<p class=\"row\"><strong>Installer contact:</strong> ");
            append(out, outLen, &offset, escInstaller);
            append(out, outLen, &offset, "</p>");
        }
        append(out, outLen, &offset, "</div>");
    }

    append(out, outLen, &offset, "<div class=\"panel\">");
    append(out, outLen, &offset, "<p class=\"row\"><strong>MAC:</strong> ");
    append(out, outLen, &offset, escMac);
    append(out, outLen, &offset, "</p><p class=\"row\"><strong>Pairing:</strong> ");
    append(out, outLen, &offset, nvs.isPaired() ? "paired" : "not paired");
    append(out, outLen, &offset, "</p><p class=\"row\"><strong>Wi-Fi:</strong> ");
    append(out, outLen, &offset, wifi.isConnected() ? (wifi.isSoftAp() ? "setup AP" : "connected") : "disconnected");
    append(out, outLen, &offset, "</p><p class=\"row\"><strong>IP:</strong> ");
    append(out, outLen, &offset, wifi.localIp());
    append(out, outLen, &offset, "</p><p class=\"row\"><strong>Server:</strong> ");
    append(out, outLen, &offset, escServer[0] != '\0' ? escServer : "(not configured)");
    append(out, outLen, &offset, "</p><p class=\"row\"><strong>Hub:</strong> ");
    if (provisioningMode) {
        append(out, outLen, &offset, "off (provisioning)");
    } else if (hubConnected) {
        append(out, outLen, &offset, "connected (");
        append(out, outLen, &offset, hubStateLabel != nullptr ? hubStateLabel : "unknown");
        append(out, outLen, &offset, ")");
    } else {
        append(out, outLen, &offset, hubStateLabel != nullptr ? hubStateLabel : "offline");
    }
    append(out, outLen, &offset, "</p></div>");

    append(out, outLen, &offset, "<p class=\"actions\"><a class=\"btn btn-primary\" href=\"/config\">Configure</a></p>");
    appendHtmlFoot(out, outLen, &offset);
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

    appendHtmlHead(out, outLen, &offset, "Configure SomNet Device");
    append(out, outLen, &offset, "<h1>Configure</h1>");
    if (provisioningMode || !nvs.isFullyProvisioned()) {
        append(out, outLen, &offset, "<p class=\"note\">Enter Wi-Fi and SomNet API base URL (no /hubs/hardware suffix). <strong>All fields below are required</strong>, including Wi-Fi password.</p>");
    }

    append(out, outLen, &offset, "<div class=\"panel\"><form id=cfg-form method=POST action=\"/config\">");
    append(out, outLen, &offset, "<label>Device ID<input type=text readonly value=\"");
    append(out, outLen, &offset, escId);
    append(out, outLen, &offset, "\"></label><label>Friendly name (optional)<input type=text name=friendly_name maxlength=64 value=\"");
    append(out, outLen, &offset, escFriendly);
    append(out, outLen, &offset, "\"></label><label>Installer contact (optional)<input type=text name=installer_contact maxlength=128 value=\"");
    append(out, outLen, &offset, escInstaller);
    append(out, outLen, &offset, "\"></label><label>Wi-Fi SSID<input required type=text name=wifi_ssid maxlength=32 value=\"");
    append(out, outLen, &offset, escSsid);
    append(out, outLen, &offset, "\"></label><label>Wi-Fi password<input required type=password name=wifi_pass maxlength=64 value=\"");
    append(out, outLen, &offset, escPass);
    append(out, outLen, &offset, "\"></label><label>SomNet server URL<input required type=url name=server_url placeholder=\"http://192.168.x.x:5031\" maxlength=128 value=\"");
    append(out, outLen, &offset, escServer);
    append(out, outLen, &offset, "\"></label><p class=\"note\">Example: http://192.168.1.100:5031</p>");
    append(out, outLen, &offset, "<p class=\"actions\"><button id=cfg-save class=\"btn btn-primary\" type=submit disabled>Save and reboot</button> <a class=\"btn btn-secondary\" href=\"/\">Cancel</a></p></form></div>");
    append(out, outLen, &offset, "<script>(function(){var f=document.getElementById('cfg-form');if(!f)return;var b=document.getElementById('cfg-save');var req=['wifi_ssid','wifi_pass','server_url'];function ok(){for(var i=0;i<req.length;i++){var el=f.elements[req[i]];if(!el||!String(el.value||'').trim())return false;}return true;}function upd(){if(b)b.disabled=!ok();}f.addEventListener('input',upd);f.addEventListener('change',upd);upd();})();</script>");

    if (!provisioningMode) {
        append(out, outLen, &offset, "<div class=\"panel danger-zone\"><p class=\"note\">Advanced: clears Wi-Fi and server settings, or all NVS including pairing.</p>");
        append(out, outLen, &offset, "<form method=POST action=\"/config/reset-wifi\"><p class=\"actions\"><button class=\"btn btn-secondary\" type=submit>Reset Wi-Fi / server</button></p></form>");
        append(out, outLen, &offset, "<form method=POST action=\"/config/factory-reset\" onsubmit=\"return confirm('Clear all settings including pairing?')\"><p class=\"actions\"><button class=\"btn btn-danger\" type=submit>Factory reset</button></p></form></div>");
    }

    appendHtmlFoot(out, outLen, &offset);
}

void renderSavedPage(char* out, size_t outLen, const char* message) {
    if (message == nullptr) {
        message = "Settings saved.";
    }

    char escMessage[160];
    htmlEscape(message, escMessage, sizeof(escMessage));

    size_t offset = 0;
    out[0] = '\0';
    append(out, outLen, &offset, "<!DOCTYPE html><html><head><meta charset=\"utf-8\">");
    append(out, outLen, &offset, "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">");
    append(out, outLen, &offset, "<meta http-equiv=\"refresh\" content=\"5;url=/\">");
    append(out, outLen, &offset, "<title>Saved</title>");
    appendProgmemStr(out, outLen, &offset, kStyle);
    append(out, outLen, &offset, "</head><body><div class=\"page\">");
    append(out, outLen, &offset, "<h1>Saved</h1>");
    append(out, outLen, &offset, "<div class=\"alert-success\"><strong>Please wait for reboot.</strong><br>Your save was received. The device is restarting now &mdash; this usually takes 10&ndash;30 seconds.</div>");
    append(out, outLen, &offset, "<p>");
    append(out, outLen, &offset, escMessage);
    append(out, outLen, &offset, "</p><p class=\"note\">Redirecting to the <a href=\"/\">status page</a> shortly&hellip;</p>");
    append(out, outLen, &offset, "<p class=\"note\">If the status page does not load, wait for Wi-Fi to reconnect and open <a href=\"/\">/</a>.</p>");
    appendHtmlFoot(out, outLen, &offset);
}

} // namespace ConfigPages
