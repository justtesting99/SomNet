# ESP32 Firmware — Phase 1 Checklist

PlatformIO project scaffold and architecture skeleton **before** SignalR, NVS identity, config UI, or relay logic.

**Parent plan:** [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10  
**Protocol reference:** [`SomNet.Device/docs/PROTOCOL.md`](../SomNet.Device/docs/PROTOCOL.md) (Phase 0)  
**Status:** Complete (2026-09-05)  
**Target output:** Compilable `SomNet.Device/` PlatformIO project with stub modules and serial banner

---

## Phase 1 at a glance

| Item | Value |
|------|--------|
| **Goal** | Create the firmware repo layout, build system, pin constants, and mode-class skeleton |
| **Duration** | ~1 day |
| **Hardware scope** | DevKit V1 clone (`esp32dev`); relay **D4**, button **D33** (constants only — no GPIO actuation yet) |
| **Software scope** | Wi-Fi connect + retry, serial logging, empty/stub modules for later phases |
| **Explicitly out of scope** | SignalR, pairing, `ExecuteCommand`, config web UI, NVS token storage, relay FSM |
| **Blocks** | Phase 2 (NVS/MAC identity) until exit criteria met |

Update **Status** above and check boxes below as work completes. When Phase 1 is done, update the status line in [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 Phase 1.

---

## Prerequisites

### Completed upstream

- [x] Phase 0 complete — [09-ESP32-Phase-0-Checklist.md](./09-ESP32-Phase-0-Checklist.md)
- [x] [`PROTOCOL.md`](../SomNet.Device/docs/PROTOCOL.md) exists
- [ ] Review parent plan §2 (layout), §6 (execution modes), §10 Phase 1 summary

### Developer environment

- [x] **PlatformIO** installed (Cursor extension or `pio` CLI on PATH) — v6.1.19
- [x] USB driver for DevKit (CP2102 or CH340)
- [x] Board connected; correct COM port identifiable
- [x] `pio run` succeeds (`SomNet.Device/` — 2026-09-05)

### SomNet API (optional for Phase 1)

Phase 1 does **not** require the API. Useful later for Phase 4 smoke tests:

- [ ] API runs at `http://localhost:5031` when needed
- [x] PC LAN IP noted for future `config.h` / `secrets.ini` — set in local `secrets.ini` only (gitignored)

### Already present in repo (Phase 0)

| Path | Status |
|------|--------|
| `SomNet.Device/docs/PROTOCOL.md` | Exists |
| `SomNet.Device/tools/` | Phase 0 capture scripts (not part of firmware build) |
| `SomNet.Device/platformio.ini` | Exists |
| `SomNet.Device/src/` | Exists (full stub tree) |

---

## Decisions (set before or during scaffold)

| # | Decision | Options | Choice | Date |
|---|----------|---------|--------|------|
| P1-D1 | **Framework** | Arduino on ESP32 | ☑ Arduino (confirmed in plan) | 2026-09-05 |
| P1-D2 | **Board target** | `esp32dev` | ☑ `esp32dev` | 2026-09-05 |
| P1-D3 | **Relay active level** | Active-high / active-low / TBD on bench | ☐ High  ☐ Low  ☑ **TBD** — default `RELAY_ACTIVE_HIGH = true` in `boardDefs.h`, verify in Phase 6 | 2026-09-05 |
| P1-D4 | **Wi-Fi credentials (dev)** | `secrets.ini` / `wifi_credentials.h` (gitignored) | ☑ `secrets.ini` + `extra_configs` | 2026-09-05 |
| P1-D5 | **Serial baud** | 115200 typical | `115200` | 2026-09-05 |
| P1-D6 | **Firmware version string** | e.g. `0.1.0-phase1` | `0.1.0-phase1` | 2026-09-05 |
| P1-D7 | **PlatformIO environments** | `dev` only vs `dev` + `prod` stub | ☑ `dev` only (`prod_cloud` commented in ini) | 2026-09-05 |
| P1-D8 | **Libraries in Phase 1** | Minimal vs pull early deps | ☑ **Minimal** — add `ArduinoJson`, WebSocket libs in Phase 4 | 2026-09-05 |

### Confirmed (no Phase 1 decision needed)

- Repo folder: `SomNet.Device/` under SomNet root (not in `.slnx`)
- Device ID format: `esp32-{MAC}` — **placeholder** in Phase 1 banner until Phase 2
- Initial command scope: **`stroke` only** (stub dispatch table; no handler logic)
- Config web UI: **Phase 3** — do not add `ESPAsyncWebServer` in Phase 1
- Pin constants live only in `include/boardDefs.h`

---

## A. PlatformIO project bootstrap

- [x] Create `SomNet.Device/platformio.ini`
- [x] Set `platform = espressif32`, `board = esp32dev`, `framework = arduino`
- [x] Set `monitor_speed` to P1-D5 (115200)
- [x] Add `src_dir`, `include_dir` defaults (PlatformIO standard)
- [x] Add `.gitignore` entries already cover `.pio/`, `secrets.ini` (root `.gitignore`)
- [x] Create `SomNet.Device/README.md` — build/flash/monitor commands, link to `docs/PROTOCOL.md`

**Suggested `platformio.ini` skeleton (adjust after decisions):**

```ini
[platformio]
default_envs = dev

[env:dev]
platform = espressif32
board = esp32dev
framework = arduino
monitor_speed = 115200
upload_speed = 921600
build_flags =
    -D FIRMWARE_VERSION=\"0.1.0-phase1\"
; lib_deps =   ; defer to Phase 4

; [env:prod_cloud]
; build_flags = -D SOMNET_USE_WSS=1
```

**Notes:**

```
COM port / upload issues:


```

---

## B. Pin and config headers

- [x] Create `include/boardDefs.h` with `PIN_RELAY`, `PIN_BUTTON`, `RELAY_ACTIVE_HIGH`
- [x] Create `include/config.h` — server URL placeholder, feature flags, **no GPIO**
- [x] Document in README: change wiring only in `boardDefs.h`

**Target `boardDefs.h` (from plan §1.3):**

```cpp
#pragma once

constexpr int PIN_RELAY  = 4;   // D4
constexpr int PIN_BUTTON = 33;  // D33
constexpr bool RELAY_ACTIVE_HIGH = true;  // verify on bench — Phase 6
```

**Target `config.h` (Phase 1 placeholders):**

| Define / constant | Phase 1 value | Later phase |
|-------------------|-----------------|-------------|
| `SOMNET_SERVER_HOST` | From secrets or `"192.168.x.x"` | Phase 3 NVS |
| `SOMNET_SERVER_PORT` | `5031` | Phase 3 NVS |
| `WIFI_CONNECT_TIMEOUT_MS` | e.g. `30000` | — |
| `WIFI_RETRY_BASE_MS` | e.g. `5000` | — |

- [x] Add `secrets.ini.example` (Wi-Fi SSID/password template, gitignored real file)

---

## C. Source tree — files to create

Create **stub** translation units so Phase 4+ slots in without renaming. Stubs may be empty or log `"stub"` once from `setup()`.

### C.1 Core

| File | Phase 1 behavior |
|------|------------------|
| `src/main.cpp` | `setup()` / `loop()` — init serial, Wi-Fi, banner; call stub `poll()` hooks |
| `src/wifi_manager.cpp` + `.h` | Connect with retry/backoff; serial status |
| `src/device_identity.cpp` + `.h` | **Stub** — return `"esp32-UNPROVISIONED"` until Phase 2 |
| `src/nvs_store.cpp` + `.h` | **Stub** — empty `begin()` / `end()` |

### C.2 Command pipeline (skeleton only)

| File | Phase 1 behavior |
|------|------------------|
| `src/modes/i_execution_mode.h` | Interface: `start`, `poll`, `abort`, `isActive` |
| `src/modes/single_pulse_mode.cpp` + `.h` | **Stub** — `// Phase 5` |
| `src/modes/burst_sequence_mode.cpp` + `.h` | **Stub** — `// Phase 9` |
| `src/modes/automatic_session_mode.cpp` + `.h` | **Stub** — `// Phase 9` |
| `src/execution_context.cpp` + `.h` | Owns `IExecutionMode*`; `poll()` no-op |
| `src/command_handler.cpp` + `.h` | Dispatch table shell; no SignalR |
| `src/power_timing.cpp` + `.h` | **Stub** or empty `strokeMsFromPower` placeholder |
| `src/relay_controller.cpp` + `.h` | **Stub** — no GPIO writes in Phase 1 |
| `src/button_input.cpp` + `.h` | **Stub** — optional read in `loop`, log only |
| `src/signalr_client.cpp` + `.h` | **Stub** — `// Phase 4` |
| `src/config_web_server.cpp` + `.h` | **Stub** — `// Phase 3` |

- [x] All `.cpp` files listed above exist and compile
- [x] No `#include` cycles between `command_handler` ↔ `execution_context` ↔ modes
- [x] `relay_controller` includes `boardDefs.h` only (no hard-coded GPIO elsewhere)

**Checklist:**

```
Files created: platformio.ini, include/*, src/* (17 modules + 3 modes), README.md, secrets.ini.example
Compile warnings: none observed (pio run SUCCESS 2026-09-05)
```

---

## D. `main.cpp` behavior (Phase 1)

- [x] `setup()`: Serial begin, print boot line
- [x] Call `wifi_manager.begin()` (or equivalent) with credentials from P1-D4
- [x] Print **serial banner** (see §E)
- [x] `loop()`: non-blocking — `wifi_manager.poll()`, optional `button_input.poll()`, `delay(1)` or yield only (no long `delay()`)
- [x] No blocking waits > 100 ms except inside Wi-Fi connect retry policy

---

## E. Serial banner

On successful boot (after Wi-Fi attempt), print a consistent banner:

```
========================================
 SomNet Device Firmware
 Version: 0.1.0-phase1
 Device ID: esp32-UNPROVISIONED   (Phase 2: real MAC ID)
 Pairing: not paired
 Wi-Fi: disconnected / retrying
 IP: 0.0.0.0
 Server: Your server IP:Your server port
 Log prefixes: [WIFI] [CMD] [RELAY] [BTN]
========================================

[WIFI] connect timeout, status=4
[WIFI] retry in 10 s
[WIFI] connecting to <your-ssid>
[WIFI] connected IP=10.0.0.20 RSSI=-54

```

- [x] Banner includes firmware version (P1-D6)
- [x] Banner includes placeholder device ID
- [x] Banner reports Wi-Fi state and IP when connected
- [x] Log prefix convention documented for later phases: `[WIFI]`, `[CMD]`, `[RELAY]` (plan §10)

**Sample serial capture:** *(hardware verify 2026-09-05 — see block above)*

```
[WIFI] connect timeout, status=4
[WIFI] retry in 10 s
[WIFI] connecting to <your-ssid>
[WIFI] connected IP=10.0.0.20 RSSI=-54
```

---

## F. Wi-Fi manager (minimal)

- [x] Connect to SSID/password from gitignored secrets
- [x] On failure: log reason, wait (exponential or fixed backoff), retry
- [x] On success: log IP and RSSI once
- [x] `loop()`-safe — no infinite block inside `connect()`
- [x] Reconnect if link dropped (simple periodic `WiFi.status()` check)

**Not in Phase 1:** Soft-AP provisioning (Phase 3), WPA enterprise, Wi-Fi credential NVS (Phase 3).

---

## G. Build, flash, and monitor verification

- [x] `pio run` — **zero errors** (2026-09-05)
- [x] `pio run -t upload` — succeeds to board (2026-09-05)
- [x] `pio device monitor` — banner visible at P1-D5 baud
- [x] Wi-Fi connects on dev network (timeout + retry → connected; see §E)

| Step | Command | Pass? |
|------|---------|-------|
| Build | `pio run` | ☑ |
| Upload | `pio run -t upload` | ☑ |
| Monitor | `pio device monitor` | ☑ |

---

## H. Architecture compliance (plan §6)

Verify scaffold matches target architecture — **stubs are fine**, but layout must not change in later phases.

- [x] `IExecutionMode` interface exists under `src/modes/`
- [x] Three mode classes exist as separate files (stroke / burst / automatic)
- [x] `execution_context` is the only owner of active mode pointer
- [x] `relay_controller` is the only module that will touch `PIN_RELAY` (stub now)
- [x] `command_handler` does not call GPIO directly
- [x] No burst/automatic logic folded into `single_pulse_mode` “temporarily”

---

## I. Out of scope — do not implement in Phase 1

| Feature | Phase |
|---------|-------|
| SignalR negotiate / WebSocket / `PairDevice` | 4 |
| `ExecuteCommand` / `AckCommand` | 5 |
| NVS token + MAC-based `device_id` | 2 |
| HTTP config UI / Soft-AP | 3 |
| Relay pulse FSM / `stroke` execution | 5–6 |
| Button-triggered actions (beyond serial log) | 6 |
| `ArduinoJson`, WebSocket library deps | 4 (unless P1-D8 changed) |

If tempted to “just test pairing” — stop; complete this checklist first.

---

## J. Deliverables

- [x] `platformio.ini` with `dev` environment
- [x] `include/boardDefs.h`, `include/config.h`
- [x] Full stub `src/` tree per §C
- [x] `SomNet.Device/README.md` — build, flash, secrets setup
- [x] `secrets.ini.example` (no real credentials)
- [x] Serial banner + Wi-Fi retry working on hardware
- [x] Parent plan §10 Phase 1 status → **Complete**

---

## Phase 1 exit sign-off

| Criterion | Done |
|-----------|------|
| PlatformIO project builds without errors | ☑ |
| Board flashes and prints banner on serial | ☑ |
| Wi-Fi connect + retry demonstrated | ☑ |
| Pin constants only in `boardDefs.h` | ☑ |
| Mode-class skeleton in place (§H) | ☑ |
| Decisions P1-D1–D8 recorded | ☑ |
| No out-of-scope features merged (§I) | ☑ |
| Ready for Phase 2 (NVS + MAC identity) | ☑ |

**Completed by:** hardware verify (serial capture §E)  
**Date:** 2026-09-05

---

## Next phase

→ [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 **Phase 2 — NVS and MAC device identity**

Future phase checklists:

| Phase | Checklist document | Status |
|-------|-------------------|--------|
| 0 | [09-ESP32-Phase-0-Checklist.md](./09-ESP32-Phase-0-Checklist.md) | Complete |
| 1 | This document | Complete |
| 2 | [09-ESP32-Phase-2-Checklist.md](./09-ESP32-Phase-2-Checklist.md) | Not started |
| 3+ | *Created when prior phase completes* | — |
