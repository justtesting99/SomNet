#include "config_pages.h"

#include "actuator_kind.h"
#include "config.h"
#include "device_identity.h"
#include "nvs_store.h"
#include "web_ui_shared.h"
#include "wifi_manager.h"

#include <Arduino.h>

namespace {

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

void appendHtmlHead(
    char* out,
    size_t outLen,
    size_t* offset,
    const char* title,
    const char* activePage,
    bool includeStatusPill = false) {
    SomNetWebUi::appendHtmlHeadOpen(out, outLen, offset, title);
    SomNetWebUi::appendShellHeader(out, outLen, offset, activePage, kSomNetLocalOperateEnabled, includeStatusPill);
    SomNetWebUi::appendShellMainOpen(out, outLen, offset, true);
}

void appendHtmlFoot(char* out, size_t outLen, size_t* offset) {
    SomNetWebUi::appendShellClose(out, outLen, offset);
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

    appendHtmlHead(out, outLen, &offset, kSomNetStandaloneBuild ? "SomEsp Device" : "SomNet Device", "status", true);
    append(out, outLen, &offset, "<h1 class=\"page-title\">");
    append(out, outLen, &offset, kSomNetStandaloneBuild ? "SomEsp Device" : "SomNet Device");
    append(out, outLen, &offset, "</h1><div class=\"status-dashboard\"><div class=\"status-dashboard-main\">");

    const bool somespHasServer = kSomNetStandaloneBuild && escServer[0] != '\0';
    const bool somespPaired = kSomNetStandaloneBuild && nvs.isPaired();
    const bool hubRuntimeEnabled = nvs.isHubRuntimeEnabled();
    const bool hasServerUrl = escServer[0] != '\0';
    const bool devicePaired = nvs.isPaired();
    const bool showHubModeToggle =
        kSomNetLocalOperateEnabled && !provisioningMode && hasServerUrl && devicePaired;

    if (kSomNetLocalOperateEnabled && !provisioningMode) {
        append(out, outLen, &offset,
            "<div class=\"ui-panel\"><div class=\"ui-panel-hd\"><h2>Local control</h2></div><div class=\"ui-panel-bd note\">"
            "<a class=\"btn btn-primary\" href=\"/operate\">Control panel</a> "
            "(PIN unlock + arm).");
        if (kSomNetStandaloneBuild) {
            append(out, outLen, &offset, " Works with or without the SomNet hub.");
        } else {
            append(out, outLen, &offset, " LAN mirror of hub commands when the hub is offline or for bench tests.");
        }
        append(out, outLen, &offset, "</div></div>");
        if (showHubModeToggle) {
            append(out, outLen, &offset,
                "<div class=\"ui-panel\" id=\"hub-mode-panel\"><div class=\"ui-panel-hd\"><h2>Remote hub</h2></div><div class=\"ui-panel-bd\">"
                "<p class=\"note\">Switch off for LAN-only <code>/operate</code>. Switch on for SomNet UI / cloud commands "
                "(pairing stays in NVS).</p>"
                "<div class=\"switch-row\"><span>Connect SomNet hub</span>"
                "<label class=\"switch\"><input type=\"checkbox\" id=\"hub-remote\"><span class=\"slider\"></span></label>"
                "</div><p id=\"hub-mode-status\" class=\"note\"></p></div></div>");
        } else if (kSomNetStandaloneBuild && !somespHasServer) {
            append(out, outLen, &offset,
                "<div class=\"panel\"><p><strong>SomNet server (one-time)</strong></p>"
                "<p class=\"note\">Save your API base URL (LAN IP, not <code>localhost</code>), enable the hub, "
                "then pair this Device ID in SomNet. After pairing you can use the switch above without rebooting.</p>"
                "<form method=POST action=\"/config/connect-somnet\">"
                "<label>SomNet server URL<input required type=url name=server_url "
                "placeholder=\"http://192.168.x.x:5031\" maxlength=128></label>"
                "<p class=\"actions\"><button class=\"btn btn-primary\" type=submit>Save server &amp; connect hub</button></p>"
                "</form></div>");
        } else if (kSomNetStandaloneBuild && !somespPaired) {
            append(out, outLen, &offset,
                "<div class=\"ui-panel\"><div class=\"ui-panel-bd note\"><strong>Pair in SomNet</strong> — hub should connect automatically. "
                "Paste the Device ID below in Dom &rarr; Sub &rarr; Options &rarr; Hardware device. "
                "When paired, the remote/local switch appears here.</div></div>");
        }
    }

    if (provisioningMode) {
        append(out, outLen, &offset,
            "<div class=\"ui-panel\"><div class=\"ui-panel-bd note\"><strong>Setup mode.</strong> On your phone or PC, join Wi-Fi "
            "<strong>SomNetSetup-XXXX</strong> (last 4 of Device ID below) with password "
            "<strong>somnetsetup</strong>, then open <a href=\"/config\">Configure</a>.</div></div>");
    }

    append(out, outLen, &offset, "<div class=\"ui-panel\"><div class=\"ui-panel-hd\"><h2>Device identity</h2></div><div class=\"ui-panel-bd\">");
    if (!kSomNetStandaloneBuild || somespHasServer) {
        append(out, outLen, &offset, "<p class=\"note\">Pair in SomNet (Dom &rarr; Sub &rarr; Options &rarr; Hardware).</p>");
    }
    append(out, outLen, &offset, "<p class=\"note\">Device ID</p><div class=\"device-id\">");
    append(out, outLen, &offset, escId);
    append(out, outLen, &offset, "</div>");
    if (!kSomNetStandaloneBuild || somespHasServer) {
        append(out, outLen, &offset,
            "<p class=\"note\">Dom account &rarr; select Sub &rarr; Options &rarr; Hardware device &rarr; paste this ID.</p>");
    }
    append(out, outLen, &offset, "</div></div></div>");

    if (escFriendly[0] != '\0' || escInstaller[0] != '\0') {
        append(out, outLen, &offset, "<div class=\"ui-panel\"><div class=\"ui-panel-hd\"><h2>Site details</h2></div><div class=\"ui-panel-bd status-kv\">");
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
        append(out, outLen, &offset, "</div></div>");
    }

    append(out, outLen, &offset, "</div><aside class=\"status-dashboard-aside\">");
    append(out, outLen, &offset, "<div class=\"ui-panel\"><div class=\"ui-panel-hd\"><h2>Connection &amp; hardware</h2></div><div class=\"ui-panel-bd status-kv\">");
    append(out, outLen, &offset, "<p class=\"row\"><strong>MAC:</strong> ");
    append(out, outLen, &offset, escMac);
    if (!kSomNetStandaloneBuild || somespHasServer) {
        append(out, outLen, &offset, "</p><p class=\"row\"><strong>Pairing:</strong> ");
        append(out, outLen, &offset, nvs.isPaired() ? "paired" : "not paired");
    }
    append(out, outLen, &offset, "</p><p class=\"row\"><strong>Wi-Fi:</strong> ");
    append(out, outLen, &offset, wifi.isConnected() ? (wifi.isSoftAp() ? "setup AP" : "connected") : "disconnected");
    append(out, outLen, &offset, "</p><p class=\"row\"><strong>IP:</strong> ");
    append(out, outLen, &offset, wifi.localIp());
    if (!kSomNetStandaloneBuild || somespHasServer) {
        append(out, outLen, &offset, "</p><p class=\"row\"><strong>Server:</strong> ");
        append(out, outLen, &offset, escServer[0] != '\0' ? escServer : "(not configured)");
    }
    append(out, outLen, &offset, "</p><p class=\"row\"><strong>Actuator:</strong> ");
    append(out, outLen, &offset, actuatorKindToJson(nvs.getActuatorKind()));
    append(out, outLen, &offset, " (relay stroke/burst or motor PWM — change in ");
    append(out, outLen, &offset, kSomNetLocalOperateEnabled ? "<a href=\"/operate\">Control panel</a> or " : "");
    append(out, outLen, &offset, "<a href=\"/config\">Configure</a>)</p><p class=\"row\"><strong>Hub:</strong> ");
    if (kSomNetStandaloneBuild && !somespHasServer) {
        append(out, outLen, &offset, "not configured");
    } else if (!hubRuntimeEnabled && kSomNetLocalOperateEnabled) {
        append(out, outLen, &offset, "paused (local only)");
    } else if (provisioningMode) {
        append(out, outLen, &offset, "off (provisioning)");
    } else if (hubConnected) {
        append(out, outLen, &offset, "connected (");
        append(out, outLen, &offset, hubStateLabel != nullptr ? hubStateLabel : "unknown");
        append(out, outLen, &offset, ")");
    } else {
        append(out, outLen, &offset, hubStateLabel != nullptr ? hubStateLabel : "offline");
    }
    append(out, outLen, &offset, "</p></div></div></aside></div>");

    append(out, outLen, &offset, "<div class=\"status-actions-bar\">");
    if (kSomNetLocalOperateEnabled && !provisioningMode) {
        append(out, outLen, &offset, "<a class=\"btn btn-primary\" href=\"/operate\">Control panel</a> ");
    }
    append(out, outLen, &offset, "<a class=\"btn btn-secondary\" href=\"/config\">Configure</a></div>");
    append(out, outLen, &offset,
        "<script>(function(){var pill=document.getElementById('status-pill');if(!pill)return;"
        "var sum=pill.querySelector('.summary');function tone(t,s){pill.className='status-pill tone-'+(t||'checking');if(sum)sum.textContent=s||'';}"
        "function apply(d){if(!d){tone('checking','Unavailable');return;}"
        "if(!d.wifiConnected){tone('error','Wi-Fi disconnected');return;}"
        "if(d.hubEnabled===false&&d.hubNetwork!==false){tone('ready','Local control — hub paused');return;}"
        "if(d.hubConnected){tone('ready','Hub connected'+(d.hubState?' ('+d.hubState+')':''));return;}"
        "if(d.hubEnabled){tone('warning','Hub connecting…'+(d.hubState?' '+d.hubState:''));return;}"
        "tone('ready','Online — '+d.ip);}"
        "function refresh(){fetch('/api/status').then(function(r){return r.json();}).then(apply).catch(function(){tone('checking','Status unavailable');});}"
        "refresh();setInterval(refresh,5000);})();</script>");
    if (showHubModeToggle) {
        append(out, outLen, &offset,
            "<script>(function(){var sw=document.getElementById('hub-remote');var st=document.getElementById('hub-mode-status');"
            "if(!sw||!st)return;var busy=false;"
            "function label(d){if(!d.hubEnabled)return 'Hub paused — use /operate on this Wi-Fi.';"
            "if(d.hubConnected)return 'Hub connected ('+(d.hubState||'')+').';"
            "return 'Hub connecting… '+(d.hubState||'');}"
            "function apply(d){sw.checked=!!d.hubEnabled;sw.disabled=busy||!d.canToggle;st.textContent=label(d);}"
            "function refresh(){fetch('/api/hub/mode').then(function(r){return r.json();}).then(apply).catch(function(){});}"
            "sw.addEventListener('change',function(){if(busy)return;busy=true;sw.disabled=true;"
            "fetch('/api/hub/mode',{method:'POST',headers:{'Content-Type':'application/json'},"
            "body:JSON.stringify({enabled:sw.checked})}).then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});})"
            ".then(function(x){if(!x.ok){sw.checked=!sw.checked;st.textContent=x.j&&x.j.error?'Failed: '+x.j.error:'Toggle failed';}"
            "else{apply(x.j);}busy=false;refresh();}).catch(function(){sw.checked=!sw.checked;busy=false;refresh();});});"
            "refresh();setInterval(refresh,4000);})();</script>");
    }
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

    appendHtmlHead(out, outLen, &offset, kSomNetStandaloneBuild ? "Configure SomEsp Device" : "Configure SomNet Device", "config");
    append(out, outLen, &offset, "<h1 class=\"page-title\">Configure</h1>");
    if (kSomNetStandaloneBuild) {
        append(out, outLen, &offset,
            "<p class=\"note\">Enter home Wi-Fi only. No SomNet server URL is used in standalone mode. "
            "<strong>Wi-Fi SSID and password are required.</strong></p>");
    } else if (provisioningMode || !nvs.isFullyProvisioned()) {
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
    append(out, outLen, &offset, "\"></label>");
    append(out, outLen, &offset, "<label>Actuator profile<select name=actuator_kind>");
    if (nvs.getActuatorKind() == DeviceActuatorKind_HBridge) {
        append(out, outLen, &offset, "<option value=\"relay\">Relay — stroke / burst</option>");
        append(out, outLen, &offset, "<option value=\"hbridge\" selected>Motor — H-bridge PWM</option>");
    } else {
        append(out, outLen, &offset, "<option value=\"relay\" selected>Relay — stroke / burst</option>");
        append(out, outLen, &offset, "<option value=\"hbridge\">Motor — H-bridge PWM</option>");
    }
    append(out, outLen, &offset,
        "</select></label><p class=\"note\">Must match the hardware module on this ESP. Save reboots the device.</p>");
    if (!kSomNetStandaloneBuild) {
        append(out, outLen, &offset, "<label>SomNet server URL<input required type=url name=server_url placeholder=\"http://192.168.x.x:5031\" maxlength=128 value=\"");
        append(out, outLen, &offset, escServer);
        append(out, outLen, &offset, "\"></label><p class=\"note\">Example: http://192.168.1.100:5031</p>");
    }
    append(out, outLen, &offset, "<p class=\"actions\"><button id=cfg-save class=\"btn btn-primary\" type=submit disabled>Save and reboot</button> <a class=\"btn btn-secondary\" href=\"/\">Cancel</a></p></form></div>");
    if (kSomNetStandaloneBuild) {
        append(out, outLen, &offset, "<script>(function(){var f=document.getElementById('cfg-form');if(!f)return;var b=document.getElementById('cfg-save');var req=['wifi_ssid','wifi_pass'];function ok(){for(var i=0;i<req.length;i++){var el=f.elements[req[i]];if(!el||!String(el.value||'').trim())return false;}return true;}function upd(){if(b)b.disabled=!ok();}f.addEventListener('input',upd);f.addEventListener('change',upd);upd();})();</script>");
    } else {
        append(out, outLen, &offset, "<script>(function(){var f=document.getElementById('cfg-form');if(!f)return;var b=document.getElementById('cfg-save');var req=['wifi_ssid','wifi_pass','server_url'];function ok(){for(var i=0;i<req.length;i++){var el=f.elements[req[i]];if(!el||!String(el.value||'').trim())return false;}return true;}function upd(){if(b)b.disabled=!ok();}f.addEventListener('input',upd);f.addEventListener('change',upd);upd();})();</script>");
    }

    if (!provisioningMode) {
        append(out, outLen, &offset, "<div class=\"panel danger-zone\"><p class=\"note\">Advanced: clears Wi-Fi");
        if (!kSomNetStandaloneBuild) {
            append(out, outLen, &offset, " and server settings, or all NVS including pairing.");
        } else {
            append(out, outLen, &offset,
                " settings, or factory reset (also clears operate PIN; default 1234 after reset).");
        }
        append(out, outLen, &offset, "</p>");
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
    SomNetWebUi::appendHtmlHeadOpen(out, outLen, &offset, "Saved");
    append(out, outLen, &offset, "<meta http-equiv=\"refresh\" content=\"5;url=/\">");
    SomNetWebUi::appendShellHeader(out, outLen, &offset, "status", kSomNetLocalOperateEnabled);
    SomNetWebUi::appendShellMainOpen(out, outLen, &offset, false);
    append(out, outLen, &offset, "<h1 class=\"page-title\">Saved</h1>");
    append(out, outLen, &offset, "<div class=\"alert-success\"><strong>Please wait for reboot.</strong><br>Your save was received. The device is restarting now &mdash; this usually takes 10&ndash;30 seconds.</div>");
    append(out, outLen, &offset, "<p>");
    append(out, outLen, &offset, escMessage);
    append(out, outLen, &offset, "</p><p class=\"note\">Redirecting to the <a href=\"/\">status page</a> shortly&hellip;</p>");
    append(out, outLen, &offset, "<p class=\"note\">If the status page does not load, wait for Wi-Fi to reconnect and open <a href=\"/\">/</a>.</p>");
    appendHtmlFoot(out, outLen, &offset);
}

} // namespace ConfigPages
