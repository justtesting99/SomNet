#include "web_ui_shared.h"

#include "config.h"

#include <Arduino.h>
#include <stdio.h>
#include <string.h>

namespace SomNetWebUi {

const char kCssRules[] PROGMEM = R"raw(
*{box-sizing:border-box}
html{color-scheme:dark;overflow-x:hidden}
body{margin:0;min-width:320px;font-family:"Segoe UI",system-ui,sans-serif;background:#020617;color:#e2e8f0;line-height:1.45;min-height:100dvh;-webkit-font-smoothing:antialiased;overflow-x:hidden}
.shell-bg{pointer-events:none;position:fixed;inset:0;background:radial-gradient(circle at top,rgba(79,70,229,.18),transparent 45%);z-index:0}
.app-shell{position:relative;z-index:1;min-height:100dvh;display:flex;flex-direction:column}
.shell-header{position:sticky;top:0;z-index:30;border-bottom:1px solid rgba(30,41,59,.85);background:rgba(2,6,23,.82);backdrop-filter:blur(12px)}
.shell-header-inner{max-width:1600px;margin:0 auto;padding:.75rem 1rem;display:flex;flex-wrap:wrap;align-items:center;gap:.75rem 1rem}
.shell-brand{min-width:0;flex:1 1 8rem}
.brand-title{font-size:1rem;font-weight:600;color:#f1f5f9;letter-spacing:-.02em}
.brand-sub{font-size:.75rem;color:#64748b;margin-top:.15rem}
.shell-nav{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem;margin-left:auto}
.shell-nav a,.shell-nav button{font-size:.8125rem}
.shell-main{flex:1;width:100%;max-width:42rem;margin:0 auto;padding:1rem 1rem 2.5rem}
.shell-main.wide{max-width:1600px;padding:1rem 1rem 2.5rem}
@media(min-width:640px){.shell-main,.shell-main.wide{padding:1.25rem 1.5rem 3rem}}
.shell-main h1.page-title{font-size:1.25rem;color:#f1f5f9;margin:0 0 1rem;font-weight:600}
.note{color:#94a3b8;font-size:.875rem;margin:.5rem 0}
.hint{font-size:.75rem;color:#64748b;margin:-.1rem 0 .35rem}
.hidden{display:none!important}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}
a{color:#818cf8;text-decoration:none}
a:hover{text-decoration:underline}
a.nav-link{padding:.4rem .65rem;border-radius:.5rem;color:#94a3b8;font-weight:600}
a.nav-link:hover{background:#1e293b;color:#e2e8f0;text-decoration:none}
a.nav-link.active{background:rgba(79,70,229,.2);color:#c7d2fe}
label{display:block;margin:.65rem 0 .3rem;font-weight:600;color:#e2e8f0;font-size:.8125rem}
input[type=text],input[type=password],input[type=url],input[type=number],select{width:100%;padding:.5rem .65rem;border:1px solid #475569;border-radius:.5rem;background:#1e293b;color:#f8fafc;font-size:.9375rem;font-family:inherit}
input:read-only{background:#334155;color:#cbd5e1}
input[type=range]{width:100%;accent-color:#818cf8;height:1.25rem}
input[type=range]::-webkit-slider-thumb{appearance:none;height:1rem;width:1rem;border-radius:9999px;background:#818cf8;border:2px solid #1e293b;box-shadow:0 0 0 4px rgba(79,70,229,.15)}
input[type=range]::-moz-range-thumb{height:1rem;width:1rem;border-radius:9999px;background:#818cf8;border:2px solid #1e293b}
.row{display:flex;flex-wrap:wrap;gap:.5rem}.row>*{flex:1 1 8rem;min-width:0}
.device-id{font-family:ui-monospace,monospace;font-size:1rem;word-break:break-all;user-select:all;color:#a5b4fc;padding:.65rem;background:#1e293b;border-radius:.5rem;border:1px solid #4338ca;margin:.35rem 0}
.actions,.panel-actions{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-top:.75rem}
button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:.35rem;padding:.55rem 1rem;border-radius:.75rem;border:1px solid transparent;font-size:.875rem;font-weight:600;cursor:pointer;font-family:inherit;transition:background .15s,transform .1s}
button:active,.btn:active{transform:scale(.98)}
.btn-primary{background:#4f46e5;color:#fff;box-shadow:0 1px 2px rgba(49,46,129,.35)}
.btn-primary:hover{background:#6366f1}
.btn-primary:disabled,.btn-primary:disabled:hover{background:#334155;color:#64748b;cursor:not-allowed;opacity:.85}
.btn-secondary{background:#334155;color:#e2e8f0;border-color:#475569}
.btn-secondary:hover{background:#475569}
.btn-ghost{background:transparent;color:#cbd5e1;border-color:transparent}
.btn-ghost:hover{background:#1e293b;color:#fff}
.btn-danger{background:rgba(220,38,38,.9);color:#fff}
.btn-danger:hover{background:#ef4444}
.btn.sm,.btn-ghost.sm{padding:.35rem .65rem;font-size:.8125rem;border-radius:.5rem}
.btn.lg{padding:.85rem 1.25rem;font-size:1rem;width:100%}
.alert-success{padding:.75rem 1rem;background:rgba(79,70,229,.15);border:1px solid #4f46e5;border-radius:.75rem;color:#e0e7ff;margin:.75rem 0}
.danger-zone{margin-top:1.5rem;padding-top:1rem;border-top:1px solid #334155}
.ui-panel{min-width:0;overflow:hidden;border-radius:.75rem;border:1px solid rgba(51,65,85,.9);background:rgba(15,23,42,.55);margin-bottom:1rem}
.ui-panel-hd{border-bottom:1px solid #1e293b;padding:.5rem .75rem;display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}
.ui-panel-hd h2{font-size:.875rem;font-weight:600;color:#e2e8f0;margin:0;line-height:1.2}
.ui-panel-bd{padding:1rem}
@media(min-width:640px){.ui-panel-bd{padding:1.1rem 1.25rem}}
.panel{background:rgba(15,23,42,.55);border:1px solid #334155;border-radius:.75rem;padding:1rem;margin:.65rem 0}
.panel.hidden{display:none!important}
.subpanel{border:1px solid #334155;border-radius:.5rem;padding:.75rem;margin:.75rem 0;background:rgba(2,6,23,.35)}
.subpanel h2{font-size:.875rem;color:#e2e8f0;margin:0 0 .5rem;font-weight:600}
label.chk{display:flex;align-items:center;gap:.5rem;font-weight:500}label.chk input{width:auto;flex:0 0 auto}
.status{font-size:.8125rem;color:#a5b4fc;min-height:1.2rem}
.status-pill{min-width:0;flex:1 1 12rem;max-width:28rem;border-radius:.75rem;border:1px solid;padding:.35rem .75rem;font-size:.8125rem}
.status-pill .dot{height:.625rem;width:.625rem;border-radius:9999px;flex-shrink:0;box-shadow:0 0 8px}
.status-pill-inner{display:flex;align-items:center;gap:.5rem;min-width:0}
.status-pill .summary{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tone-ready{border-color:rgba(16,185,129,.35);background:rgba(16,185,129,.12);color:#6ee7b7}
.tone-ready .dot{background:#34d399;box-shadow:0 0 8px rgba(52,211,153,.45)}
.tone-warning{border-color:rgba(245,158,11,.35);background:rgba(245,158,11,.12);color:#fcd34d}
.tone-warning .dot{background:#fbbf24;box-shadow:0 0 8px rgba(251,191,36,.4)}
.tone-error{border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.12);color:#fca5a5}
.tone-error .dot{background:#f87171}
.tone-checking{border-color:rgba(100,116,139,.5);background:rgba(30,41,59,.65);color:#cbd5e1}
.tone-checking .dot{background:#94a3b8}
.gate-screen{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:1.25rem;background:rgba(2,6,23,.92);backdrop-filter:blur(8px)}
html.session-resume #gate{display:none!important}
html.session-resume #main.app-shell.hidden{display:flex!important}
.gate-card{width:100%;max-width:26rem}
.gate-card .ui-panel-bd{padding:1.25rem}
.dashboard-grid{display:grid;gap:1rem;align-items:start}
@media(min-width:1024px){.dashboard-grid{grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:1.5rem}}
.dashboard-aside{min-width:0}
@media(min-width:1024px){.dashboard-aside{position:sticky;top:4.75rem;max-height:calc(100dvh - 6rem);overflow-y:auto}}
.device-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem;margin-bottom:1rem}
.mode-segment{display:inline-flex;border-radius:.5rem;border:1px solid #334155;padding:.125rem;background:rgba(2,6,23,.5)}
.mode-seg{border:none;background:transparent;color:#94a3b8;padding:.35rem .85rem;border-radius:.375rem;font-size:.75rem;font-weight:600;cursor:pointer;text-transform:capitalize}
.mode-seg.active{background:#4f46e5;color:#fff}
.mode-seg:hover:not(.active){background:#1e293b;color:#e2e8f0}
.focus-label{margin:0;font-size:.75rem;color:#64748b;text-transform:uppercase;letter-spacing:.04em;font-weight:600;width:100%}
.focus-select{margin-top:.25rem;font-size:.875rem}
.header-toggle{display:flex;align-items:center;gap:.5rem;border-radius:.75rem;border:1px solid rgba(71,85,105,.55);background:rgba(30,41,59,.55);padding:.4rem .65rem;margin-left:auto}
.header-toggle.on{border-color:rgba(99,102,241,.45);background:rgba(79,70,229,.12)}
.header-toggle-label{font-size:.8125rem;font-weight:600;color:#cbd5e1}
.header-toggle-state{font-size:.625rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
.header-toggle.on .header-toggle-state{color:#a5b4fc}
.toggle-switch{position:relative;width:2.5rem;height:1.35rem;flex-shrink:0;display:inline-block}
.toggle-switch input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;z-index:2}
.toggle-knob{position:absolute;inset:0;background:#334155;border-radius:999px;pointer-events:none;z-index:1;transition:background .2s}
.toggle-knob:before{content:"";position:absolute;height:1rem;width:1rem;left:.2rem;bottom:.175rem;background:#e2e8f0;border-radius:50%;transition:transform .2s}
.toggle-switch input:checked+.toggle-knob{background:#4f46e5}
.toggle-switch input:checked+.toggle-knob:before{transform:translateX(1.05rem)}
.toggle-switch input:disabled{cursor:not-allowed}
.toggle-switch input:disabled+.toggle-knob{opacity:.45}
.header-toggle.is-disabled{opacity:.65}
.control-grid{display:grid;gap:1rem}
@media(min-width:768px){.control-grid.cols-2{grid-template-columns:1fr 1fr}}
.graph-panel .graph-canvas-wrap{overflow:hidden;border-radius:.5rem;background:#0f172a}
.graph-panel canvas{width:100%;height:auto;display:block;touch-action:none;cursor:grab}
.graph-panel canvas.graph-dragging{cursor:grabbing}
.graph-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin-bottom:.5rem}
.graph-toolbar .panel-actions{margin:0;flex:0 0 auto}
.hist-detail{white-space:pre-wrap;font-size:.75rem;margin:.5rem 0 0;max-height:min(50vh,20rem);overflow:auto;background:#1e293b;border:1px solid #334155;border-radius:.5rem;padding:.75rem}
#hist-list{list-style:none;padding:0;margin:0}
#hist-list li{padding:.45rem .5rem;border-radius:.375rem;cursor:pointer;font-size:.8125rem;color:#cbd5e1}
#hist-list li:hover{background:#1e293b}
.modal-backdrop{position:fixed;inset:0;z-index:40;background:rgba(2,6,23,.75);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:1rem;overflow-y:auto}
.modal-backdrop.hidden{display:none!important}
.modal{width:100%;max-width:42rem;margin-top:2rem}
.switch-row{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin:.5rem 0}
.switch{position:relative;display:inline-block;width:3rem;height:1.65rem;flex:0 0 auto}
.switch input{opacity:0;width:0;height:0}
.switch .slider{position:absolute;cursor:pointer;inset:0;background:#334155;border-radius:999px;transition:background .2s}
.switch .slider:before{position:absolute;content:"";height:1.25rem;width:1.25rem;left:.2rem;bottom:.2rem;background:#e2e8f0;border-radius:50%;transition:transform .2s}
.switch input:checked+.slider{background:#4f46e5}
.switch input:checked+.slider:before{transform:translateX(1.35rem)}
.switch input:disabled+.slider{opacity:.5;cursor:not-allowed}
#hub-mode-status{font-size:.875rem;color:#a5b4fc;min-height:1.25rem}
.layout-split{display:flex;flex-direction:column;gap:1rem}
@media(min-width:768px){.layout-split{flex-direction:row;align-items:flex-start}.layout-split>.layout-col{flex:1;min-width:0}}
.session-banner{border-radius:.75rem;border:1px solid rgba(99,102,241,.35);background:rgba(79,70,229,.12);color:#c7d2fe;padding:.65rem .85rem;font-size:.875rem;margin:0 0 1rem;line-height:1.4}
.power-slider-grid{display:grid;gap:1rem;grid-template-columns:1fr;min-width:0}
@media(min-width:640px){.power-slider-grid{grid-template-columns:1fr 1fr}}
.power-slider-cell{min-width:0;padding:.25rem 0}
.power-slider-label{font-size:.8125rem;font-weight:600;color:#cbd5e1;margin:0 0 .35rem;text-align:center}
.power-slider-val{text-align:center;margin:.35rem 0 0;font-size:.8125rem}
.status-kv{display:grid;gap:.35rem;margin:0}
.status-kv p{margin:.25rem 0;font-size:.875rem}
.status-kv strong{color:#e2e8f0;font-weight:600}
.status-dashboard{display:grid;gap:1rem;align-items:start}
@media(min-width:900px){.status-dashboard{grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:1.25rem}}
.status-dashboard-aside{min-width:0}
@media(min-width:900px){.status-dashboard-aside{position:sticky;top:4.75rem}}
.status-actions-bar{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.5rem}
)raw";

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

static void append(char* out, size_t outLen, size_t* offset, const char* text) {
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

void appendHtmlHeadOpen(char* out, size_t outLen, size_t* offset, const char* title) {
    append(out, outLen, offset, "<!DOCTYPE html><html><head><meta charset=\"utf-8\">");
    append(out, outLen, offset, "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">");
    append(out, outLen, offset, "<title>");
    append(out, outLen, offset, title);
    append(out, outLen, offset, "</title>");
    append(out, outLen, offset, "<link rel=\"stylesheet\" href=\"/ui/somnet.css\">");
}

void appendShellHeader(
    char* out,
    size_t outLen,
    size_t* offset,
    const char* activePage,
    bool includeOperateLink,
    bool includeStatusPill) {
    append(out, outLen, offset, "</head><body><div class=\"shell-bg\"></div><div class=\"app-shell\">");
    append(out, outLen, offset, "<header class=\"shell-header\"><div class=\"shell-header-inner wide\">");
    append(out, outLen, offset, "<div class=\"shell-brand\"><div class=\"brand-title\">");
    append(out, outLen, offset, kSomNetStandaloneBuild ? "SomEsp" : "SomNet");
    append(out, outLen, offset, "</div><div class=\"brand-sub\">");
    append(
        out,
        outLen,
        offset,
        kSomNetStandaloneBuild ? "Standalone device" : "Device status");
    append(out, outLen, offset, "</div></div>");
    if (includeStatusPill) {
        append(
            out,
            outLen,
            offset,
            "<div id=\"status-pill\" class=\"status-pill tone-checking\" role=\"status\">"
            "<div class=\"status-pill-inner\"><span class=\"dot\"></span>"
            "<span class=\"summary\">Checking…</span></div></div>");
    }
    append(out, outLen, offset, "<nav class=\"shell-nav\">");
    const bool statusActive = activePage != nullptr && strcmp(activePage, "status") == 0;
    const bool operateActive = activePage != nullptr && strcmp(activePage, "operate") == 0;
    const bool configActive = activePage != nullptr && strcmp(activePage, "config") == 0;
    append(out, outLen, offset, "<a class=\"nav-link");
    if (statusActive) {
        append(out, outLen, offset, " active");
    }
    append(out, outLen, offset, "\" href=\"/\">Status</a>");
    if (includeOperateLink) {
        append(out, outLen, offset, "<a class=\"nav-link");
        if (operateActive) {
            append(out, outLen, offset, " active");
        }
        append(out, outLen, offset, "\" href=\"/operate\">Control</a>");
    }
    append(out, outLen, offset, "<a class=\"nav-link");
    if (configActive) {
        append(out, outLen, offset, " active");
    }
    append(out, outLen, offset, "\" href=\"/config\">Configure</a>");
    append(out, outLen, offset, "</nav></div></header>");
}

void appendShellMainOpen(char* out, size_t outLen, size_t* offset, bool wide) {
    append(out, outLen, offset, wide ? "<main class=\"shell-main wide\">" : "<main class=\"shell-main\">");
}

void appendShellClose(char* out, size_t outLen, size_t* offset) {
    append(out, outLen, offset, "</main></div></body></html>");
}

} // namespace SomNetWebUi
