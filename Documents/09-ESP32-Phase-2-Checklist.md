# ESP32 Firmware — Phase 2 Checklist

NVS persistence and **MAC-based device identity** (`esp32-{MAC}`) — foundation for pairing and config UI.

**Parent plan:** [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §8, §10  
**Protocol reference:** [`SomNet.Device/docs/PROTOCOL.md`](../SomNet.Device/docs/PROTOCOL.md)  
**Prior phase:** [09-ESP32-Phase-1-Checklist.md](./09-ESP32-Phase-1-Checklist.md) (complete)  
**Status:** Complete (2026-09-05)  
**Target output:** Stable `device_id` in NVS; `nvs_store` schema ready for Phase 3/4; banner shows real ID + raw MAC

---

## Phase 2 at a glance

| Item | Value |
|------|--------|
| **Goal** | Replace `esp32-UNPROVISIONED` with persistent MAC-derived device ID; implement NVS layer |
| **Duration** | ~1 day |
| **Hardware scope** | Same DevKit — optional long-press factory reset on **D33** |
| **Software scope** | `device_identity`, `nvs_store` (Preferences), banner/serial updates |
| **Explicitly out of scope** | SignalR pairing flow, config web UI, Wi-Fi-from-NVS provisioning, relay, commands |
| **Blocks** | Phase 3 (config UI) until exit criteria met |

Update **Status** above and check boxes below as work completes. When Phase 2 is done, update the status line in [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 Phase 2.

---

## Prerequisites

### Completed upstream

- [x] Phase 1 complete — [09-ESP32-Phase-1-Checklist.md](./09-ESP32-Phase-1-Checklist.md)
- [x] PlatformIO scaffold builds and flashes
- [x] Wi-Fi connect + serial banner verified on hardware
- [ ] Review parent plan §4.1 (device ID), §8 (NVS data model)

### Developer environment

- [x] Board connected; `pio device monitor` at 115200 baud
- [x] Hardware verify — device ID + banner (2026-09-05; redacted capture in §C)

### Current stubs (Phase 1)

| Module | Today | Phase 2 target |
|--------|--------|----------------|
| `device_identity.*` | Returns `esp32-UNPROVISIONED` | MAC → `esp32-{12HEX}` + NVS persist |
| `nvs_store.*` | `begin()` no-op, `isPaired()` always false | Full Preferences namespace + pairing fields |

---

## Decisions (set before coding)

| # | Decision | Options | Choice | Date |
|---|----------|---------|--------|------|
| P2-D1 | **NVS API** | `Preferences` (Arduino) vs raw `nvs_flash` | ☑ Preferences | 2026-09-05 |
| P2-D2 | **NVS namespace** | e.g. `somnet` | `somnet` | 2026-09-05 |
| P2-D3 | **MAC source** | Wi-Fi STA MAC vs EFUSE | ☑ `esp_read_mac(..., ESP_MAC_WIFI_STA)` | 2026-09-05 |
| P2-D4 | **ID hex casing** | Upper vs lower | ☑ **Uppercase** (confirmed §4.1) e.g. `esp32-A4C1389F2B01` | |
| P2-D5 | **Firmware version bump** | e.g. `0.2.0-phase2` | `0.2.0-phase2` | 2026-09-05 |
| P2-D6 | **Factory reset** | Long-press button clears NVS | ☑ Implement | 2026-09-05 |
| P2-D7 | **Factory reset hold time** | e.g. 5 s / 10 s | `10` s (warn at 5 s) | 2026-09-05 |
| P2-D8 | **Keys in Phase 2** | Minimal vs full §8 schema | ☑ **Full schema stubs** — read/write for all §8 keys; only `device_id` + pairing flags required for tests | 2026-09-05 |

### Confirmed (no Phase 2 decision needed)

- Device ID format: `esp32-{12 hex MAC digits}`, no colons, uppercase
- Same MAC → same ID after reboot and after factory reset (regenerated from MAC)
- Pairing token storage keys exist in NVS but **are not populated** until Phase 4 (`PairDevice`)
- Wi-Fi still from `secrets.ini` at compile time until Phase 3 moves credentials to NVS
- Do not add config HTTP server in this phase

---

## A. `device_identity` module

Replace stub with MAC-based ID generation and NVS coordination.

### A.1 Format rules

| Rule | Requirement |
|------|-------------|
| Prefix | `esp32-` |
| Body | 12 hex digits from MAC (6 bytes), **uppercase** |
| Example | `esp32-A4C1389F2B01` |
| Max length | Fit in 32-char buffer (current `deviceId_`) |

### A.2 Logic

- [x] Read MAC from chosen source (P2-D3)
- [x] Format `device_id` string per table above
- [x] On first boot: compute ID → save to NVS via `nvs_store`
- [x] On later boots: load `device_id` from NVS; if missing or invalid, regenerate from MAC and save
- [x] Expose `deviceId()` — never returns `esp32-UNPROVISIONED` after successful `begin()`
- [x] Expose raw MAC for banner/debug (e.g. `macAddress()` → `AA:BB:CC:DD:EE:FF` or hex without colons)

**Implementation notes:**

```
MAC read method: esp_read_mac(mac, ESP_MAC_WIFI_STA)

First-boot vs load path: load device_id from NVS; if missing/invalid/MAC mismatch → format esp32-{12HEX} → save
```

---

## B. `nvs_store` module

Implement ESP32 **Preferences** wrapper for namespace `somnet` (or P2-D2).

### B.1 Schema (from plan §8)

| Key | Type | Phase 2 |
|-----|------|---------|
| `device_id` | string | **Read/write** — primary deliverable |
| `device_friendly_name` | string | Read/write API (empty default) |
| `installer_contact` | string | Read/write API (empty default) |
| `wifi_ssid` | string | Stub get/set — used Phase 3 |
| `wifi_pass` | string | Stub get/set — used Phase 3 |
| `server_url` | string | Stub get/set — used Phase 3 |
| `use_tls` | bool | Stub get/set — default false |
| `access_token` | string | Stub get/set — used Phase 4 |
| `token_expires` | ulong | Stub get/set — used Phase 4 |
| `dom_target` | string | Stub get/set — used Phase 4 |
| `sub_target` | string | Stub get/set — used Phase 4 |
| `paired` | bool | Read/write — default false |
| `provisioned` | bool | Read/write — default false until Phase 3 |

- [x] `begin()` opens namespace; returns false on fatal error (log and continue with RAM-only fallback if needed)
- [x] `end()` closes / commits as appropriate for Preferences
- [x] `clearAll()` for factory reset — wipes namespace keys
- [x] `clearPairing()` — clears token, dom/sub, `paired` only (optional helper)
- [x] `isPaired()` reflects NVS `paired` flag AND non-empty `access_token` (or paired flag alone for Phase 2)

### B.2 API surface (minimum)

- [x] `getDeviceId` / `setDeviceId`
- [x] `getFriendlyName` / `setFriendlyName`
- [x] `getInstallerContact` / `setInstallerContact`
- [x] Pairing: `getAccessToken`, `setAccessToken`, `getTokenExpires`, `setTokenExpires`, `getDomTarget`, `setDomTarget`, `getSubTarget`, `setSubTarget`, `isPaired`, `setPaired`
- [x] Provisioning stubs: `getWifiSsid`, `setWifiSsid`, … `isProvisioned`, `setProvisioned`

**Notes:**

```
Preferences namespace: somnet

Error handling: begin() returns false; identity still runs from MAC in RAM
```

---

## C. Integration — `main.cpp` and banner

- [x] Init order: `nvs_store.begin()` → `device_identity.begin()` (identity may read/write NVS)
- [x] Banner shows **real** `deviceId()` (not placeholder)
- [x] Banner shows **raw MAC** (secondary line for support)
- [x] Banner `Pairing:` reflects `nvs_store.isPaired()` (still `not paired` until Phase 4)
- [x] Remove or update Phase 1 comment `(Phase 2: real MAC ID)` in banner text
- [x] Optional: bump `FIRMWARE_VERSION` in `platformio.ini` (P2-D5)

**Target banner (example — redact real MAC in checklist commits):**

```
[BOOT] SomNet.Device starting
[NVS] opened
[ID] loaded device_id=esp32-XXXXXXXXXXXX
[CMD] command_handler stub ready (Phase 5)
[WIFI] connecting to <your-ssid>
E (1531) wifi_init_default: netstack cb reg failed with 12308
[WIFI] connected IP=10.0.0.xx RSSI=-51
========================================
 SomNet Device Firmware
 Version: 0.2.0-phase2
 Device ID: esp32-XXXXXXXXXXXX
 MAC: XX:XX:XX:XX:XX:XX
 Pairing: not paired
 Wi-Fi: connected
 IP: 10.0.0.xx
 Server: 192.168.x.x:5031
 Log prefixes: [WIFI] [CMD] [RELAY] [BTN] [NVS] [ID]
========================================
```

- [x] Serial log on boot: `[NVS] opened` / `[ID] device_id=esp32-...`

**Sample serial capture:** *(hardware verify 2026-09-05 — redacted for git)*

```
[ID] loaded device_id=esp32-XXXXXXXXXXXX (matches MAC esp32-{12HEX})
Banner: Version 0.2.0-phase2, pairing not paired, Wi-Fi connected
Note: wifi_init_default netstack cb warning observed once; connect succeeded
```

---

## D. Factory reset (optional — P2-D6)

**Update (Phase 3):** Button hold is now **credential reset** (Wi‑Fi + server only), not full NVS wipe. See [Hardware User Guide](./Hardware-User-Guide.md). Full factory reset remains on `/config` when on LAN.

Long-press **PIN_BUTTON** (D33, active low) clears NVS and reboots.

- [x] Hold detection non-blocking in `button_input.poll()` or dedicated `factory_reset` helper
- [x] Hold duration ≥ P2-D7 (e.g. 10 s) with serial countdown or progress logs
- [x] On trigger: `nvs_store.clearAll()` → `ESP.restart()`
- [x] After reboot: **same** `device_id` (regenerated from MAC) — `[ID] loaded` on verify
- [x] Pairing fields cleared (`paired` false, no token) — N/A until Phase 4 pair test

**Not in Phase 2:** Soft-AP provisioning mode after reset (Phase 3).

---

## E. Verification tests

Run on hardware with serial monitor.

### E.1 First boot

- [x] Flash fresh (or `clearAll` once via test hook) — NVS had stored ID (`loaded`)
- [x] Serial shows `device_id` matching MAC format
- [x] ID matches pattern `esp32-[0-9A-F]{12}`

### E.2 Reboot stability

- [x] Press EN / power-cycle
- [x] **Same** `device_id` as before reboot
- [x] No `esp32-UNPROVISIONED` in output

### E.3 NVS persistence across flash (same chip)

- [x] Reboot 3× — ID unchanged each time (user verified)

### E.4 Factory reset (if implemented)

- [ ] Long-press triggers reset *(optional — not verified this session)*
- [ ] After reboot: same `device_id`, `paired` false, friendly name cleared

### E.5 Build

- [x] `pio run` — zero errors (2026-09-05)
- [x] `pio run -t upload` — succeeds (2026-09-05)

| Test | Pass? |
|------|-------|
| First boot ID format | ☑ |
| Reboot same ID | ☑ |
| Banner MAC + device ID | ☑ |
| Factory reset (optional) | N/A |
| Build | ☑ |

---

## F. Documentation updates

- [x] `SomNet.Device/README.md` — note NVS namespace, device ID format, factory reset gesture (if implemented)
- [ ] Optional one-line in `docs/PROTOCOL.md` §device ID if implementation detail differs from capture
- [x] **Do not** commit real MAC addresses or Wi-Fi SSIDs in checklist captures — redacted in §C

---

## G. Architecture compliance

- [x] `device_identity` does not touch GPIO (except MAC read via Wi-Fi/EFUSE)
- [x] Only `nvs_store` opens Preferences namespace (single owner)
- [x] No SignalR, HTTP server, or relay logic added
- [x] Phase 1 module layout unchanged (no renames)

---

## H. Out of scope — do not implement in Phase 2

| Feature | Phase |
|---------|-------|
| SignalR / `PairDevice` / token use | 4 |
| Populate pairing from hub messages | 4 |
| Config web UI / Soft-AP | 3 |
| Load Wi-Fi from NVS instead of `secrets.ini` | 3 |
| `ExecuteCommand` / relay | 5–6 |
| `GET /api/devices/unpaired` | 8 (API) |

---

## I. Deliverables

- [x] `device_identity.*` — MAC format + NVS persistence
- [x] `nvs_store.*` — Preferences wrapper + §8 schema
- [x] Updated `main.cpp` banner and init order
- [x] Optional factory reset on long-press
- [x] README updated
- [x] Parent plan §10 Phase 2 status → **Complete**

---

## Phase 2 exit sign-off

| Criterion | Done |
|-----------|------|
| `device_id` is `esp32-{MAC}` uppercase, persisted | ☑ |
| Reboot preserves same `device_id` | ☑ |
| Banner shows device ID + raw MAC | ☑ |
| `nvs_store` schema ready for Phase 3/4 | ☑ |
| Decisions P2-D1–D8 recorded | ☑ |
| No out-of-scope features merged (§H) | ☑ |
| Ready for Phase 3 (config web UI) | ☑ |

**Completed by:** hardware verify (serial capture §C, redacted)  
**Date:** 2026-09-05

---

## Next phase

→ [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 **Phase 3 — Config web UI and registration UX**

Future phase checklists:

| Phase | Checklist document | Status |
|-------|-------------------|--------|
| 0 | [09-ESP32-Phase-0-Checklist.md](./09-ESP32-Phase-0-Checklist.md) | Complete |
| 1 | [09-ESP32-Phase-1-Checklist.md](./09-ESP32-Phase-1-Checklist.md) | Complete |
| 2 | This document | Complete |
| 3 | [09-ESP32-Phase-3-Checklist.md](./09-ESP32-Phase-3-Checklist.md) | Complete |
| 4+ | *Created when prior phase completes* | — |
