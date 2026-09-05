# ESP32 Firmware — Phase 3 Checklist



On-device **config web UI** and **registration UX** — Wi-Fi + server URL in NVS, device ID visible on LAN, Soft-AP provisioning.



**Parent plan:** [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §4, §8, §10  

**Protocol reference:** [`SomNet.Device/docs/PROTOCOL.md`](../SomNet.Device/docs/PROTOCOL.md)  

**Prior phase:** [09-ESP32-Phase-2-Checklist.md](./09-ESP32-Phase-2-Checklist.md) (complete)  

**Status:** Complete (2026-09-05)  

**Target output:** Phone-friendly HTTP UI on LAN; installer can provision Wi-Fi/server and copy **device ID** for SomNet pairing (Phase 4 / Swagger)



---



## Phase 3 at a glance



| Item | Value |

|------|--------|

| **Goal** | LAN config UI + NVS-backed Wi-Fi/server URL; prominent MAC-based device ID |

| **Duration** | 2–3 days |

| **Hardware scope** | Same DevKit; HTTP on port 80 (or chosen port) while in STA or Soft-AP |

| **Software scope** | `config_web_server`, provisioning mode, `wifi_manager` reads NVS, HTML in PROGMEM |

| **Explicitly out of scope** | SignalR client, `PairDevice`, Dom/Sub on device UI, relay test, HTTPS on device |

| **Blocks** | Phase 4 (SignalR) until exit criteria met — device ID obtainable without serial |



Update **Status** above and check boxes below as work completes. When Phase 3 is done, update the status line in [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 Phase 3.



---



## Prerequisites



### Completed upstream



- [x] Phase 2 complete — [09-ESP32-Phase-2-Checklist.md](./09-ESP32-Phase-2-Checklist.md)

- [x] `device_identity` → stable `esp32-{MAC}` in NVS

- [x] `nvs_store` schema with provisioning + pairing keys (§8)

- [x] Review parent plan §4 (config UI), §3 (network model), §4.1 (registration)



### Developer environment



- [x] Phone or laptop on same Wi-Fi as ESP32 (for LAN UI test)

- [x] SomNet API reachable at configured `server_url` from LAN (optional until Phase 4)

- [x] Know ESP32 STA IP from serial (`[WIFI] connected IP=…`) or Soft-AP portal



### Current stubs (Phase 2)



| Module | Today | Phase 3 target |

|--------|--------|----------------|

| `config_web_server.*` | Empty stub | `ESPAsyncWebServer` on port 80 |

| `wifi_manager.*` | Credentials from compile-time `secrets.ini` only | Load from NVS when `provisioned`; Soft-AP mode |

| `main.cpp` | No boot mode FSM | PROVISIONING vs RUNNING |



---



## Decisions (set before coding)



| # | Decision | Options | Choice | Date |

|---|----------|---------|--------|------|

| P3-D1 | **HTTP library** | `ESPAsyncWebServer` + `AsyncTCP` | ☑ ESP32Async/ESPAsyncWebServer + AsyncTCP | 2026-09-05 |

| P3-D2 | **HTTP port** | 80 / 8080 | **80** | 2026-09-05 |

| P3-D3 | **HTML storage** | PROGMEM strings / LittleFS | ☑ PROGMEM (embedded in `config_pages.cpp`) | 2026-09-05 |

| P3-D4 | **Soft-AP SSID pattern** | e.g. `SomNet-Setup-{last4MAC}` | `SomNet-Setup-{last4 of deviceId}` | 2026-09-05 |

| P3-D5 | **Soft-AP password** | Open / fixed dev password | ☑ Open | 2026-09-05 |

| P3-D6 | **Provisioned detection** | `provisioned` flag + non-empty `wifi_ssid` + `server_url` | ☑ Both required | 2026-09-05 |

| P3-D7 | **Dev fallback** | Use `secrets.ini` when not provisioned | ☑ **Yes** — compile-time fallback until first POST `/config` | 2026-09-05 |

| P3-D8 | **Firmware version** | e.g. `0.3.0-phase3` | `0.3.0-phase3` | 2026-09-05 |

| P3-D9 | **Installer contact field** | On `/config` form | ☑ Yes (optional field) | 2026-09-05 |

| P3-D10 | **Copy setup summary** | Button on `/` for email handoff | ☑ Phase 3 | 2026-09-05 |

| P3-D11 | **Config page access** | Always on LAN / button-gated / time-limited | ☑ Always (Phase 3 MVP); **10 s button** = credential reset → setup AP — see [Hardware User Guide](./Hardware-User-Guide.md) | 2026-09-05 |

| P3-D12 | **Captive portal** | DNS redirect on Soft-AP | ☑ No (manual URL) | 2026-09-05 |



### Confirmed (no Phase 3 decision needed)



- Device ID on UI: **read-only**, from `device_identity` / NVS — never user-editable

- **No** Dom login, Sub picker, or manual JWT entry on ESP32

- `server_url` = API **base** only (e.g. `http://192.168.x.x:5031`) — **no** `/hubs/hardware` suffix

- Pairing remains **SomNet UI / Swagger** (Phase 8 UI) + SignalR (Phase 4)

- Do not port-forward ESP32 to WAN — document in README

- SignalR **off** during initial Soft-AP provisioning until Wi-Fi + server saved (Phase 4 starts after provisioned)



---



## A. PlatformIO dependencies and build



- [x] Add to `platformio.ini` `lib_deps`:

  - `ESPAsyncWebServer` (compatible espressif32 version)

  - `AsyncTCP` (or `ESP32Async/AsyncTCP` per PlatformIO registry)

- [x] Bump `FIRMWARE_VERSION` (P3-D8)

- [x] `pio run` succeeds with new libs

- [x] Document any `board_build.filesystem` if LittleFS chosen (P3-D3) — N/A (PROGMEM chosen)



**Notes:**



```

lib_deps versions used:

  ESP32Async/ESPAsyncWebServer @ ^3.6.0 (resolved 3.12.0)

  ESP32Async/AsyncTCP @ ^3.3.5 (resolved 3.5.0)



Build warnings: none

```



---



## B. Boot mode and provisioning logic



Implement operating modes from plan §4:



| Mode | Enter when | Wi-Fi | HTTP | SignalR |

|------|------------|-------|------|---------|

| **PROVISIONING** | `!isProvisioned()` (P3-D6) | Soft-AP | Setup portal | Off |

| **RUNNING** | Provisioned | STA | Status + `/config` | Off until Phase 4 |



- [x] `isProvisioned()` uses NVS (`provisioned` flag + required fields per P3-D6)

- [x] PROVISIONING: start Soft-AP, serve setup form at `/` or `/config`

- [x] RUNNING: connect STA from NVS (`wifi_ssid`, `wifi_pass`); fallback to `secrets.ini` if P3-D7 and not provisioned

- [x] After successful POST `/config`: set `provisioned=true`, save fields, `ESP.restart()`

- [x] Serial log mode on boot: `[MODE] PROVISIONING` / `[MODE] RUNNING`



**Implementation notes:**



```

Mode state machine: main.cpp (boot mode selection, tryWifiRecovery)

Soft-AP IP: 192.168.4.1 (wifi_manager)

Auto-recovery: 5 STA failures → clearProvisioning + restart or Soft-AP

```



---



## C. `wifi_manager` — NVS credentials



- [x] `begin()` loads SSID/password from NVS when provisioned

- [x] Dev fallback: compile-time `WIFI_SSID` / `WIFI_PASSWORD` when not provisioned (P3-D7)

- [x] Add `startSoftAp(ssid, password?)` for provisioning (non-blocking setup)

- [x] Add `stopSoftAp()` when leaving provisioning (on reboot into RUNNING)

- [x] STA reconnect logic unchanged (Phase 1)

- [x] On STA connect in RUNNING: serial `Config UI: http://<ip>/` (plan §4)



---



## D. `config_web_server` module



Replace stub with async HTTP server.



- [x] `begin(mode, dependencies)` — bind port P3-D2; register routes

- [x] `poll()` — no-op or minimal (AsyncTCP event-driven); must not block `loop()`

- [x] Server runs in PROVISIONING (AP) and RUNNING (STA)

- [x] Graceful behavior if Wi-Fi down (RUNNING): server may be unreachable — log only



### D.1 Routes (minimum)



| Route | Method | Phase 3 |

|-------|--------|---------|

| `/` | GET | Status page (registration-focused) |

| `/config` | GET | Setup/edit form |

| `/config` | POST | Save → NVS → reboot |

| `/api/status` | GET | Optional JSON for same data |

| `/config/reset-wifi` | POST | Optional — clear Wi-Fi/server, reboot to provisioning |

| `/config/factory-reset` | POST | Optional — `nvs_store.clearAll()`, reboot |



- [x] All routes implemented per minimum above (optional routes marked if deferred)



---



## E. Status page (`GET /`)



**Registration UX — primary installer/Dom handoff surface.**



- [x] **Device ID** — large, read-only, copy-friendly (monospace + optional “copy” JS or `user-select: all`)

- [x] Instruction text: *“Pair this ID in SomNet (Dom account → Sub → Pair device)”*

- [x] **Friendly name** (if set in NVS)

- [x] **MAC address** (read-only, secondary)

- [x] **Pairing state** — unpaired / paired (from `nvs_store.isPaired()`); Dom/Sub if paired (Phase 4+ may show live hub state later)

- [x] **Wi-Fi** — connected / SSID name (no password displayed)

- [x] **Server URL** — from NVS

- [x] Link to **`/config`** to edit settings

- [x] Hub connection: “not connected” stub until Phase 4 (or omit)

- [x] Mobile-friendly single-column layout

- [x] No Wi-Fi passwords or JWTs in HTML



**Optional (P3-D10):**



- [ ] “Copy setup summary” — plain text: device ID, friendly name, installer contact, server URL *(deferred — `user-select: all` on device ID sufficient for MVP)*



---



## F. Config form (`GET/POST /config`)



### F.1 Form fields



| Field | Editable | NVS key | Required on save |

|-------|----------|---------|------------------|

| Device ID | **Read-only** | `device_id` | — |

| Friendly name | Yes | `friendly_name` | No |

| Installer contact | Yes (if P3-D9) | `installer` | No |

| Wi-Fi SSID | Yes | `wifi_ssid` | Yes |

| Wi-Fi password | Yes | `wifi_pass` | Yes (WPA) |

| SomNet server URL | Yes | `server_url` | Yes |

| Use TLS (wss) | Checkbox or auto from `https://` | `use_tls` | No |



- [x] Validate server URL: non-empty, no trailing `/hubs/hardware`

- [x] Parse `https://` → set `use_tls=true`

- [x] Reject obviously invalid input (empty SSID, empty server URL)

- [x] POST response: “Saved — rebooting…” then `ESP.restart()` after short delay



### F.2 Security (MVP)



- [x] No file upload endpoints

- [x] No shell/command execution from form values

- [x] Document: do not port-forward ESP32 HTTP to internet (README)



---



## G. HTML / assets



- [x] Store HTML/CSS in `data/config/` as PROGMEM or embedded strings (P3-D3) — `config_pages.cpp`

- [x] Keep total page size modest (< ~20 KB combined) for ESP32 RAM

- [x] No external CDN dependencies (works offline on LAN)

- [x] Consistent styling with status + config pages

- [x] **Redact** real device IDs/MACs/SSIDs in checklist screenshots before git commit



**File list:**



```

src/config_pages.cpp   (PROGMEM inline HTML/CSS renderers)

src/config_web_server.cpp

```



---



## H. Integration — `main.cpp`



- [x] Init order: NVS → identity → determine mode → wifi (AP or STA) → `config_web_server.begin()` → other stubs

- [x] `loop()`: `wifi_manager.poll()`, `config_web_server.poll()`, … (SignalR stub unchanged)

- [x] Do **not** start SignalR in Phase 3 (Phase 4)

- [x] 10 s button hold → credential reset (`clearProvisioning`) → Soft-AP on next boot



**Note (2026-09-05):** Button hold is **credential reset** (`clearProvisioning`), not full NVS wipe. Documented in [Hardware User Guide](./Hardware-User-Guide.md). Full factory reset remains on `/config/factory-reset` when on LAN.



---



## I. Verification tests



### I.1 PROVISIONING (fresh or after factory reset)



- [x] Device boots Soft-AP (SSID per P3-D4)

- [x] Phone joins AP; open `http://192.168.4.1/` (or documented AP IP)

- [x] Form saves Wi-Fi + server URL → reboot

- [x] Device joins home Wi-Fi (STA)



### I.2 RUNNING — LAN status UI



- [x] From phone on same LAN: open `http://<device-sta-ip>/`

- [x] Device ID visible and matches serial / NVS

- [x] `/config` loads; edit friendly name → save → reboot → name persists

- [x] Serial shows `Config UI: http://…` on Wi-Fi connect



### I.3 Dev fallback (P3-D7)



- [x] With NVS not provisioned but `secrets.ini` present: still connects (pre-migration path) OR document one-time provision required



### I.4 Build and regression



- [x] `pio run` — zero errors

- [x] `pio run -t upload` — succeeds

- [x] Phase 2 identity unchanged after provision (same `device_id` after reboot)

- [x] Wi-Fi retry still works if SSID wrong (edit via `/config` or 10 s button credential reset)



| Test | Pass? |

|------|-------|

| Soft-AP provisioning | ☑ |

| Status page on STA | ☑ |

| POST /config persists NVS | ☑ |

| Device ID copyable from UI | ☑ |

| 10 s button credential reset | ☑ |

| Save/reboot UX (saved page + redirect) | ☑ |

| No secrets in committed docs | ☑ |

| Build | ☑ |



**Sample notes (redact before git):**



```

Device STA IP: <redacted — DHCP>



Browser test date: 2026-09-05



Verified: provisioning, LAN status, save/reboot, credential reset button

```



---



## J. Documentation updates



- [x] `SomNet.Device/README.md` — config UI URLs, provisioning flow, no port-forward warning

- [x] [Hardware User Guide](./Hardware-User-Guide.md) — installer/owner doc (provisioning, 10 s credential reset, Device ID)

- [ ] Link from README to pairing procedure (Swagger until Phase 8) — README references Phase 4 / Swagger; dedicated Swagger pairing doc deferred to Phase 4

- [x] Note: after Phase 3, `secrets.ini` optional once device provisioned via UI

- [x] Checklist captures use placeholders only (no real SSID/MAC/IP)



---



## K. Architecture compliance



- [x] HTTP server non-blocking alongside existing `loop()` modules

- [x] `device_id` only from `device_identity` — form cannot override

- [x] No Dom/Sub/JWT fields on forms

- [x] NVS writes only through `nvs_store` (no scattered `Preferences` calls)

- [x] Phase 1/2 module boundaries preserved



---



## L. Out of scope — do not implement in Phase 3



| Feature | Phase |

|---------|-------|

| SignalR / WebSocket / `PairDevice` | 4 |

| Hub connection status (live) | 4 |

| `ExecuteCommand` / relay test button | 5–6 |

| Dom/Sub picker on ESP32 | Never |

| HTTPS / TLS on device HTTP server | Optional later |

| QR code on status page | Future polish |

| SomNet React pairing UI | 8 |

| `GET /api/devices/unpaired` | 8 (API) |

| SomNet web app visual styling on device pages | 7 (see plan §4) |



---



## M. Deliverables



- [x] `platformio.ini` updated with Async web libs

- [x] `config_web_server.*` implemented

- [x] `wifi_manager.*` NVS + Soft-AP support

- [x] PROGMEM (or LittleFS) HTML for `/` and `/config`

- [x] Boot mode PROVISIONING / RUNNING

- [x] README updated

- [x] Parent plan §10 Phase 3 status → **Complete**



---



## Phase 3 exit sign-off



| Criterion | Done |

|-----------|------|

| Installer configures Wi-Fi + server from phone/browser | ☑ |

| Device ID visible on LAN without serial | ☑ |

| Settings persist across reboot | ☑ |

| Soft-AP provisioning works (first boot / credential reset) | ☑ |

| Decisions P3-D1–D12 recorded | ☑ |

| No out-of-scope features merged (§L) | ☑ |

| Ready for Phase 4 (SignalR + pairing) | ☑ |



**Completed by:** hardware verify (browser + 10 s button reset)  

**Date:** 2026-09-05



---



## Next phase



→ [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 **Phase 4 — Minimal SignalR client + pairing**



Future phase checklists:



| Phase | Checklist document | Status |

|-------|-------------------|--------|

| 0–2 | Prior checklists | Complete |

| 3 | This document | Complete |

| 4 | [09-ESP32-Phase-4-Checklist.md](./09-ESP32-Phase-4-Checklist.md) | **Complete** |

| 5+ | *Created when prior phase completes* | — |


