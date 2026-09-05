# ESP32 Device Project — Plan of Action

This document defines the plan for a standalone Arduino/ESP32 firmware project that connects outbound to the SomNet API via SignalR, stores pairing credentials in NVS, drives a relay output with **device-side timing**, and reports command lifecycle back to the server.

**Core execution principle:** The SomNet UI/API sends **parameters** (e.g. `strokeMs`, burst counts, delays, automatic config). The ESP32 **executes all timing locally** — relay close duration, inter-stroke delays, random automatic schedules — without the server driving real-time hardware loops.

**Source-of-truth principle:** What the UI/API **records** about strokes, bursts, and automatic sessions must reflect **what the device actually did**, as reported in the completion message (`AckCommand`) after each command — not what the UI assumed when the button was pressed.

**Timing architecture:** Firmware is **non-blocking** — explicit **state machines** drive relay pulses, bursts, and automatic schedules using `millis()` polling so SignalR and Wi-Fi stay responsive while timing stays accurate.

**Initial development scope:** First firmware milestones implement **`stroke` (single pulse) only** — pairing, SignalR, relay timing, and ack. The codebase **must still be structured** for `burst` and `automatic` modes (`IExecutionMode`, `execution_context`, separate mode classes) so later features plug in without rework. See §6 and §10.

**Critical path after scaffold:** **Device registration** — associating a physical unit with a **Sub** on the SomNet server so SignalR commands reach the right device. The on-device config web UI (MAC-based ID, optional friendly name) plus a SomNet UI pairing flow address this. See **§4.1**.

**Scope:** Planning and architecture only. No changes to existing SomNet API or UI code until explicitly approved.

**Related docs:** [SignalR & Hardware](./06-SignalR-And-Hardware.md), [Authentication & Security](./05-Authentication-And-Security.md), [API Reference](./02-API-Reference.md)

---

## 1. Goals and Constraints

### Goals

| # | Requirement | Intent |
|---|-------------|--------|
| 1 | **No WAN port forwarding** | SomNet traffic is outbound to the server; router needs no inbound rules. LAN-only config UI is optional (see §4) |
| 2 | **Persistent pairing token in NVS** | Survive reboot; reconnect without re-pairing until revoke or expiry |
| 3 | **Outbound SignalR to SomNet API** | Secure, token-authenticated hub connection; act only on messages destined for this device |
| 4 | **Acknowledge command lifecycle** | Server and UI know when a message was received and when action completed |
| 5 | **Initial action = serial logging** | Relay/button logic stubbed; commands logged to Serial Monitor during development |
| 6 | **On-device configuration web UI** | Wi-Fi, server URL, **device identity display**, optional friendly name — enables registration (see §4, §4.1) |
| 7 | **Device-side timing execution** | Relay and sequence timing on ESP32; automatic uses **random** pulse length and random inter-pulse gaps (see §6) |
| 8 | **Device-reported history** | Completion ack from device updates API/UI session state — device is authoritative (see §9) |
| 9 | **Non-blocking timing architecture** | No blocking waits in the main path; state machines for stroke, burst, and automatic timing (see §6, §12) |

### Non-Goals (initial firmware milestones)

- OTA firmware updates
- Offline command queue
- SomNet UI pairing dialog (pair via Swagger/API during dev; device UI shows ID only)
- Changes to SomNet backend or frontend (unless a protocol gap is approved)
- Full-featured device admin portal (keep config UI minimal)
- **Fully implemented burst and automatic modes** — architecture and stubs only until single-pulse path is proven (see §6 *Initial vs target implementation*)

### Hardware (confirmed)

| Component | Detail |
|-----------|--------|
| **Main board** | **ESP32 DevKit V1 clone** (ESP32-WROOM-32 class, 30-pin dev board) |
| **PlatformIO board** | `esp32dev` in `platformio.ini` |
| **USB serial** | On-board CP2102/CH340 (clone-dependent); **115200** baud for monitor |
| **Relay module** | **D4** (GPIO 4) → optocoupled input; module has **built-in LED(s)** on relay state — no separate status LEDs in project |
| **Push button** | **D33** (GPIO 33) — input with internal pull-up, debounced |

### Status LEDs

| Location | Present? | Firmware |
|----------|----------|----------|
| **External / project LEDs** | **No** | No GPIO allocated for status indicators |
| **ESP32 DevKit on-board LED** | Usually GPIO 2 (built into board) | **Do not use for relay logic** — optional debug only if needed |
| **Relay module built-in LED(s)** | **Yes** | Driven by module circuitry when opto input activates — **no extra firmware**; use for visual confirmation during bench test |

Firmware status and command trace rely on **Serial Monitor** (115200) until/unless external LEDs are added later.

### Relay module (optocoupler)

Typical 1-channel ESP32 relay module layout:

```
ESP32 D4 (GPIO 4) ──► optocoupler input (IN) ──► relay driver ──► relay contacts (load)
                              │
                         module LED(s) follow input/relay state
```

| Aspect | Detail |
|--------|--------|
| **Isolation** | Optocoupler separates ESP32 logic from relay coil/high-voltage side — ESP32 GPIO only drives the low-current LED side of the opto |
| **Safety** | Load wiring stays on relay screw terminals; do not route mains through the dev board. Firmware controls **timing only** on `PIN_RELAY` |
| **Active level** | Many modules are **active-low** (IN pulled low to turn on). Set `RELAY_ACTIVE_HIGH` in `boardDefs.h` to match your module |
| **Visual feedback** | Module LED illuminates when relay is energized — sufficient for stroke/burst testing without external LEDs |

**Pin mapping:** DevKit silkscreen labels (`D4`, `D33`) map to ESP32 GPIO numbers. All hardware pins are defined as **constants in `include/boardDefs.h`** so wiring can be corrected in one place without searching the codebase.

| Silkscreen | GPIO | Constant (proposed) | Role |
|------------|------|---------------------|------|
| **D4** | 4 | `PIN_RELAY` | Relay control (digital output) |
| **D33** | 33 | `PIN_BUTTON` | Push switch (digital input, pull-up) |

Example `include/boardDefs.h`:

```cpp
#pragma once

// ESP32 DevKit V1 clone — update here if wiring changes
constexpr int PIN_RELAY  = 4;   // D4
constexpr int PIN_BUTTON = 33;  // D33

// Relay active level (many opto modules are active-LOW — verify against module LED behavior)
constexpr bool RELAY_ACTIVE_HIGH = true;
```

Firmware must **never hard-code GPIO numbers** in `main.cpp` or drivers — include `boardDefs.h` from `relay_controller`, `button_input`, etc.

**Avoid** flash pins **6–11** and boot-strapping pins **0, 2, 12, 15** for new wiring. D4 and D33 are acceptable on typical DevKit V1 clones with Wi-Fi enabled.

DevKit V1 clones vary slightly (CP2102 vs CH340 USB chip); PlatformIO `esp32dev` profile works for most WROOM-32 V1 clones. If upload fails, try holding **BOOT**, press **EN**, or lower `upload_speed` in `platformio.ini`.

---

## 2. Repository and Project Layout

### Confirmed layout: `SomNet.Device/` in this repo (PlatformIO)

The ESP32 firmware is a **PlatformIO** project (C++ / Arduino framework on ESP32). It lives under the SomNet repo root, **outside** `SomNet.slnx` — not built or opened as part of the Visual Studio / .NET solution.

**Target layout:**

```
D:\MoreRepos\SomNet\
├── SomNet.API/
├── SomNet.Shared/
├── SomNet.UI/
├── SomNet.Device/             ← PlatformIO firmware (confirmed)
│   ├── platformio.ini
│   ├── README.md
│   ├── include/
│   │   ├── boardDefs.h        ← GPIO / relay polarity (D4, D33) — single place to change wiring
│   │   └── config.h           ← Server URL, feature flags (not pin numbers)
│   ├── src/
│   │   ├── main.cpp
│   │   ├── wifi_manager.*
│   │   ├── nvs_store.*
│   │   ├── device_identity.*
│   │   ├── signalr_client.*
│   │   ├── command_handler.*
│   │   ├── execution_context.*  ← Active IExecutionMode*, poll/abort routing
│   │   ├── power_timing.*       ← powerPercent ↔ strokeMs, random helpers
│   │   ├── modes/
│   │   │   ├── i_execution_mode.h
│   │   │   ├── single_pulse_mode.*
│   │   │   ├── burst_sequence_mode.*
│   │   │   └── automatic_session_mode.*
│   │   ├── relay_controller.*
│   │   ├── button_input.*
│   │   └── config_web_server.*
│   ├── data/
│   │   └── config/            ← Embedded HTML/CSS (PROGMEM or LittleFS)
│   └── docs/
│       └── PROTOCOL.md
├── Documents/
└── data/
```

Open and build firmware with **Cursor (or VS Code) + PlatformIO extension**, or the `pio` CLI — not Visual Studio.

### Repository options (reference)

| Approach | Verdict |
|----------|---------|
| **`SomNet.Device/` inside SomNet repo** | **Confirmed** — one clone, shared docs, separate toolchain |
| **Sibling repo** | Optional if releases/CI should split later |
| **Inside `SomNet.slnx` / Visual Studio solution** | **No** — wrong IDE and build system |
| **Inside `SomNet.API/`** | **Avoid** — wrong technology stack |

### Toolchain — PlatformIO (confirmed)

| Item | Choice |
|------|--------|
| **Build system** | PlatformIO (`platformio.ini`) |
| **IDE** | **Cursor** + PlatformIO extension (**confirmed installed**) or CLI only |
| **Board target** | **`esp32dev`** — ESP32 DevKit V1 clone (confirmed) |
| **Environments** | e.g. `dev_local` (serial, ws), `prod_cloud` (wss) |

PlatformIO provides reproducible builds, pinned libraries, and straightforward CI (`pio run`).

**Core libraries (evaluate during implementation):**

| Library | Purpose |
|---------|---------|
| `WiFi` / `WiFiClientSecure` | Network |
| `Preferences` or `nvs_flash` | NVS token and config storage |
| `ArduinoJson` | Parse `PairDevice`, `ExecuteCommand`, build `AckCommand` payloads |
| WebSocket client | `WebSocketsClient` (links2004) or ESP-IDF `esp_websocket_client` |
| SignalR | **No mature official ESP32 library** — plan for a thin custom client (see §7) |
| HTTP config UI | `ESPAsyncWebServer` + `AsyncTCP` (non-blocking; runs alongside hub client) |

---

## 3. Network Model — Outbound SomNet, Optional LAN Config

SomNet **command and pairing traffic** is always **outbound** from the ESP32 to the server. The home router requires **no port forwarding** for normal operation.

Separately, the ESP32 may run a **small HTTP server on the local LAN** so an operator can configure Wi-Fi and server URL from a phone or PC. That traffic stays on the private network and is **not** exposed through the router unless the user deliberately forwards ports (which is **not** required and **not** recommended).

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         User home LAN                                   │
│                                                                         │
│   [ Phone/PC browser ] ──HTTP (LAN)──► [ ESP32 :80 config UI ]         │
│              │                              │                           │
│              │                              │ outbound WebSocket         │
│              │                              ▼                           │
│              └────── HTTP ──────────► [ SomNet API / cloud ]            │
│                                        /hubs/hardware                   │
│                                                                         │
│   Router: no port forwarding required                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### SomNet connectivity (outbound only)

| Topic | Detail |
|-------|--------|
| **Connection direction** | ESP32 → SomNet server (WebSocket client) |
| **Local development** | ESP32 connects to `ws://<dev-pc-lan-ip>:5031/hubs/hardware?...` (same Wi-Fi as PC running API) |
| **Production** | ESP32 connects to `wss://<cloud-host>/hubs/hardware?...` (outbound 443) |
| **Firewall (WAN)** | User network must allow **outbound** HTTP/WebSocket; no **inbound** WAN rules |
| **NAT** | Not an issue for outbound client connections |

### On-device config web UI (LAN only)

| Topic | Detail |
|-------|--------|
| **Connection direction** | User device → ESP32 (HTTP server on LAN IP, e.g. `http://192.168.1.42`) |
| **Internet exposure** | **None by default** — config UI is not part of SomNet cloud path |
| **Port forwarding** | **Not required** — user joins same Wi-Fi and opens ESP32 local IP |
| **Coexistence with SignalR** | **Yes** — see §4; different roles (inbound HTTP server vs outbound WebSocket client) |

### TLS

- **Cloud SignalR:** `WiFiClientSecure` + wss; pin certificate or use system CA bundle
- **Local dev SignalR:** may use plain `ws://` on LAN
- **Device config UI:** HTTP on LAN is acceptable for Phase 1; optional HTTPS on device is complex and usually omitted for local setup pages

---

## 4. On-Device Configuration Web UI

### Is a web frontend required?

| Configuration need | Required? | Who provides it |
|--------------------|-----------|-----------------|
| **Wi-Fi SSID / password** | **Yes (production)** | ESP32 config web UI (or serial/AP fallback) |
| **SomNet server base URL** | **Yes (production)** | ESP32 config web UI or NVS (local IP vs cloud hostname) |
| **Device ID (for pairing)** | **Yes** | Shown on config UI + serial log |
| **Pairing token (JWT)** | **No manual entry** | Delivered by SomNet via SignalR `PairDevice` — **not** typed into device UI |
| **Dom / Sub assignment** | **No** | SomNet web app / API (`POST /api/devices/pair`) |
| **Command dispatch** | **No** | SomNet API + SignalR only |

**Conclusion:** A **minimal on-device web UI is recommended** for field setup (Wi-Fi and server URL). It is **not** a replacement for the SomNet React app — pairing and session control remain on SomNet. Development can still use serial + `config.h` before the config UI is built.

### Is it possible alongside SignalR?

**Yes.** The ESP32 routinely runs concurrent network roles:

| Role | Direction | Protocol | Library |
|------|-----------|----------|---------|
| SomNet hub client | Outbound | WebSocket + SignalR JSON | `WebSocketsClient` + custom SignalR |
| Configuration UI | Inbound (LAN) | HTTP | `ESPAsyncWebServer` |

These do not conflict:

- SignalR uses an **outbound client** connection to the cloud/PC.
- The config UI uses an **inbound HTTP server** on the ESP32’s LAN address (port 80 or 8080).
- `ESPAsyncWebServer` is event-driven and non-blocking, so `loop()` can still call `signalr_client.poll()`.

**Resource note:** ESP32-WROOM has sufficient RAM for a minimal HTML UI + one WebSocket client (~30–60 KB combined depending on page size). Keep pages small (embedded PROGMEM, no heavy JS frameworks).

### Operating modes

```
┌─────────────────┐     first boot / no Wi-Fi / button hold
│  PROVISIONING   │ ──► Soft-AP (e.g. SomNet-Setup-ABC123) + captive portal
└────────┬────────┘     SignalR: paused until Wi-Fi + server URL saved
         │ reboot
         ▼
┌─────────────────┐     normal operation
│    RUNNING      │ ──► Wi-Fi STA + SignalR hub client + optional LAN status page
└────────┬────────┘
         │ user opens http://<device-ip>/config (or long-press button)
         ▼
┌─────────────────┐     config session (can overlap RUNNING)
│  CONFIG ACTIVE  │ ──► HTTP config forms; SignalR stays connected if already paired
└─────────────────┘
```

| Mode | Wi-Fi | SignalR | HTTP server |
|------|-------|---------|-------------|
| **Provisioning** | Soft-AP | Off | Captive portal + setup form |
| **Running** | STA | On (unpaired or paired) | Status page (read-only) |
| **Config active** | STA (or AP if provisioning) | Prefer **on** during Running | Full setup / edit forms |

During **initial provisioning**, SignalR is intentionally **not** started until Wi-Fi credentials and server URL are stored — the device cannot reach the API without them.

### Config UI — functional requirements

| Page / endpoint | Method | Purpose |
|-----------------|--------|---------|
| `/` | GET | Status: **device ID (MAC-based)**, friendly name, MAC raw, pairing state, Wi-Fi, server URL, hub connection |
| `/config` | GET | Setup form: friendly name, Wi-Fi, server URL; device ID **read-only** |
| `/config` | POST | Save friendly name, Wi-Fi, server URL, TLS → NVS → reboot |
| `/config/reset-wifi` | POST | Clear Wi-Fi + server URL; enter provisioning mode |
| `/config/factory-reset` | POST | Clear all NVS including pairing token; reboot to provisioning |
| `/api/status` | GET | JSON status (optional, for simple polling from same pages) |

**Fields on `/config` form:**

| Field | Stored in NVS | Notes |
|-------|---------------|-------|
| **Device ID** | `device_id` | **Read-only** on form — derived from MAC (§4.1) |
| **Friendly name** | `device_friendly_name` | Optional; user-entered label for this unit |
| Wi-Fi SSID | `wifi_ssid` | Required |
| Wi-Fi password | `wifi_pass` | Required for WPA |
| SomNet server URL | `server_url` | e.g. `http://192.168.1.10:5031` or `https://api.example.com` — **no** `/hubs/hardware` suffix |
| Use TLS (wss) | `use_tls` | Auto-derived from `https` URL or explicit checkbox |

**Must NOT expose on config UI:**

- Manual editing of device JWT / pairing token
- Dom or Sub selection (SomNet operator flow only)
- Relay test controls that bypass SomNet authorization (optional locked “maintenance” mode later)

### Config UI — non-functional requirements

| Requirement | Detail |
|-------------|--------|
| **No WAN exposure** | Document that users must not port-forward to the ESP32 |
| **Physical or time-bound access** | Enter config mode via **button hold** (e.g. 5 s at boot) or `/config` only within 10 min after boot unless button pressed |
| **Minimal attack surface** | Static HTML + form POST; no file upload; no arbitrary SSID injection into shell |
| **Responsive layout** | Usable on phone browser (single column) |
| **Clear device ID** | Prominent copy/display for SomNet pairing step |

### Relationship to SomNet web app

| Task | SomNet React UI | ESP32 config web UI |
|------|-----------------|---------------------|
| Login as Dom | ✓ | — |
| Select Sub | ✓ | — |
| Pair device to Sub | ✓ (future UI) / Swagger today | Shows **device ID only** |
| Set Wi-Fi on ESP32 | — | ✓ |
| Set SomNet server URL | — | ✓ |
| Send stroke/burst commands | ✓ | — |
| View hub connection status | ✓ (system status) | ✓ (local diagnostic) |

No changes to SomNet are **required** for the device config UI alone. **SomNet UI pairing** (Dom selects Sub, enters device ID from ESP32 screen) is required for production registration — currently Swagger-only; see §4.1 and Phase 8.

### Device registration and Sub association (§4.1)

This is the **main integration challenge** after initial scaffolding: the operator must link **this physical ESP32** to **one Sub** under their Dom so `ExecuteCommand` messages reach the device.

#### Split of responsibility

| Step | Where | Who |
|------|--------|-----|
| Wi-Fi + server URL | ESP32 config web UI | Device installer (anyone on LAN) |
| **Device identifier** | ESP32 — **auto from MAC**, shown read-only | No manual random ID entry |
| **Friendly name** (optional) | ESP32 config form → NVS | Installer labels unit (e.g. “Garage valve”) |
| **Sub assignment** | SomNet web app (future) or Swagger (dev) | Authenticated **Dom** |
| **Pairing token** | SomNet API → SignalR `PairDevice` | Automatic after Dom pairs |

The ESP32 **does not** choose or store which Sub it belongs to until the server sends `PairDevice`. The config UI’s job is to make **identity obvious** and **network path working**; the SomNet UI’s job is **Dom + Sub + pair API**.

#### Association security — valid mental model (with one important correction)

**What you have right:**

| Idea | Correct? |
|------|----------|
| Process **starts** with ESP32 web setup (Wi-Fi, server URL, identity visible) | **Yes** |
| Once pairing completes, the server has **device ID + Dom + Sub** bound together | **Yes** |
| Server issues a **device JWT** that becomes the basis of **secure** hub traffic | **Yes** |
| Every later `ExecuteCommand` is scoped to that device and validated with the token | **Yes** |

**Important correction — where Dom and Sub are entered:**

| Approach | Valid? | Why |
|----------|--------|-----|
| Installer enters **Dom + Sub names on the ESP32 page alone**; device sends them to API; server immediately issues JWT | **No (not recommended)** | Anyone on the LAN could pair a device to **any** Dom/Sub without proving they are that Dom |
| **Authenticated Dom** in SomNet UI selects Sub and pairs **device ID** (from ESP32 page/email/pending list) | **Yes — this is the model** | Server only binds Dom+Sub+device after **operator JWT** proves who the Dom is |
| Device sends a **pairing request** (device ID + friendly name); Dom **approves** in SomNet UI | **Yes — optional future enhancement** | Same security: JWT only after Dom action |

So: the ESP32 page **does not** complete association by itself. It prepares the device to **reach** the server (network + identity). **Association** (Dom + Sub + device ID → JWT) is an **authenticated server action** triggered by the Dom in SomNet (or Swagger in dev).

#### What the server knows at each stage

```
Stage 1 — After ESP32 config + unpaired SignalR connect
  Server knows: deviceId (esp32-MAC), connection is unpaired, maybe friendly name (future)
  Server does NOT yet: assign Dom/Sub, issue device JWT

Stage 2 — After Dom calls POST /api/devices/pair?subTarget=Slv66 { deviceId }
  Server knows: Dom (from operator JWT), Sub (query + validation), deviceId, live connection
  Server creates: device JWT (audience SomNet.Device, claims dom, sub, device_id)
  Server sends: PairDevice via SignalR → ESP32 stores token in NVS

Stage 3 — All subsequent messaging
  Device connects: ?access_token={device JWT}
  ExecuteCommand includes: accessToken + deviceId + dom + sub
  Device verifies: token and targeting before acting on relay
  Operator commands: only via authenticated API → paired group
```

That JWT binding is exactly what makes later transactions **secure and scoped** — your take on post-pairing security is **valid**.

#### End-to-end registration flow

```
┌─────────────┐   1. Open config UI     ┌─────────────┐
│  Installer  │ ───────────────────────►│    ESP32    │
│  (phone)    │   Wi-Fi, server URL,    │  HTTP :80   │
└─────────────┘   optional friendly name └──────┬──────┘
                                                │ 2. Reboot → Wi-Fi STA
                                                │ 3. deviceId = esp32-{MAC}
                                                │ 4. SignalR unpaired connect
                                                ▼
┌─────────────┐   5. Select Sub,        ┌─────────────┐
│  Dom        │      enter device ID    │  SomNet API │
│  (browser)  │ ───────────────────────►│  + UI       │
└─────────────┘   POST /api/devices/pair└──────┬──────┘
                                                │ 6. PairDevice → token
                                                ▼
                                         ┌─────────────┐
                                         │    ESP32    │
                                         │  paired JWT │
                                         └─────────────┘
```

#### Device ID — MAC-based (confirmed approach)

| Aspect | Detail |
|--------|--------|
| **Format** | `esp32-{12 hex MAC digits}` e.g. `esp32-A4C1389F2B01` (uppercase, no colons) |
| **Generation** | Read Wi-Fi STA MAC (or EFUSE) once in `device_identity`; persist in NVS as `device_id` |
| **User entry** | **None on device** — displayed read-only on `/` and `/config` with copy-friendly layout |
| **Uniqueness** | Suitable for **many devices** on one server — MAC is globally unique per unit |
| **Stability** | Same MAC → same ID across reboots; factory reset keeps MAC, regenerates same ID |

Optional **friendly name** (`device_friendly_name` in NVS) helps humans distinguish units; see email workflow below.

#### Registration strategies — comparison

Several approaches work with the existing `POST /api/devices/pair` + unpaired SignalR connection model. For **many devices**, combine more than one.

| Strategy | How it works | Pros | Cons |
|----------|--------------|------|------|
| **A. MAC ID + paste in UI** | Dom copies `esp32-{MAC}` from device page into pair dialog | Simple; no API change; works offline-first on device | Typo risk; tedious at scale |
| **B. Email / message handoff** | Installer emails Dom: device ID + friendly name + location; Dom pairs from email | Fits real-world install (installer ≠ Dom); async | Manual process; not automated |
| **C. Pending devices list (recommended API add)** | Device connects unpaired; server lists **online unpaired** devices; Dom picks one + Sub | **Best UX at scale**; no typing; server already tracks unpaired connections in memory | Device must be online; needs new `GET /api/devices/unpaired` (Phase 8) |
| **D. QR code on device page** | Status page shows QR encoding `deviceId`; Dom scans in UI | Fast, no typos | UI camera/scanner work; still MAC underneath |
| **E. Dom-generated pairing code** | Dom creates code in UI; installer enters code on ESP32 | Dom-driven | Extra step on device; worse for “installer on site first” |
| **F. UUID not tied to MAC** | Random ID in NVS | Hides MAC | User must copy random string; **worse** than MAC for your case |

**MAC as canonical ID remains correct** — unique, factory-derived, zero installer guesswork. The question is only **how the Dom learns the ID**, not whether to use MAC.

#### Recommended hybrid (production)

Use **layers** that fit different situations:

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1 — Device (always)                                       │
│  MAC → esp32-{MAC} + optional friendly name on config UI         │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Layer 2a        │  │ Layer 2b        │  │ Layer 2c        │
│ Pending list    │  │ Email handoff   │  │ Paste / QR      │
│ (online now)    │  │ (async)         │  │ (fallback)      │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
              POST /api/devices/pair?subTarget={Sub}
                              │
                              ▼
                    PairDevice → device JWT
```

| Layer | When to use |
|-------|-------------|
| **2a — Pending list** | Device is powered, on Wi-Fi, connected unpaired — Dom opens “Pair device”, sees **“esp32-… — Workshop valve — online”**, clicks Pair |
| **2b — Email handoff** | Installer not co-located with Dom; device may be offline when Dom pairs — email contains ID + friendly name (+ optional installer contact) |
| **2c — Paste / QR** | Fallback; small fleet; pending API not shipped yet |

#### Email-assisted workflow (operational — no protocol change)

Supports your scenario: **installer on site**, **Dom uses UI later**.

1. Installer completes ESP32 config (Wi-Fi, server URL, optional **friendly name**).
2. Installer opens device status page — copies **Device ID** (`esp32-{MAC}`) or uses “Share / email setup info” (future: mailto link with pre-filled body).
3. Installer emails Dom (or support desk):

   ```
   Subject: Pair SomNet device — Workshop valve

   Device ID: esp32-A4C1389F2B01
   Friendly name: Workshop valve
   Installer: Jane Smith (jane@example.com)
   Location: Building B
   Server: https://api.example.com
   ```

4. Dom logs into SomNet, selects **Sub**, opens pair dialog:
   - Pastes **Device ID** from email, **or**
   - Selects device from **pending list** if it is online (matches ID in email)
5. Dom confirms pair → same `POST /api/devices/pair` as today.

**Username in email:** map to **installer contact** (informational). **Dom** is always the authenticated SomNet user performing pair; the installer is not a SomNet login unless they are also the Dom.

Optional config UI field (Phase 3+):

| Field | Purpose |
|-------|---------|
| **Installer name / email** | Shown on status page; included in “copy setup summary” for email — stored NVS only until API stores it |

#### Pending devices list — suggested API (Phase 8)

Server **already registers** unpaired connections (`DeviceConnectionRegistry.RegisterUnpaired`). Extend SomNet when approved:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/devices/unpaired` | List `{ deviceId, connectedAt, lastSeen? }` for Dom (auth required) |
| Optional | Include `friendlyName` if device sends it via future hub hello message |

UI: **“Devices waiting to pair”** table → select row → Pair to **current Sub**.

This eliminates MAC typing for online devices while keeping email workflow for async installs.

#### SomNet UI (Phase 8) — pairing dialog

1. Dom logged in; **Sub selected** in header.
2. **Pair device** dialog with tabs or sections:
   - **Online now** — pending/unpaired list (preferred when API exists)
   - **Enter device ID** — paste from email or device screen
   - Optional later: **Scan QR**
3. Show **friendly name** from email or future device metadata when available.
4. **Pair** → `POST /api/devices/pair?subTarget={currentSub}` with `{ deviceId }`.
5. Show result + `GET /api/devices/status` connection state.

Until Phase 8: Swagger + device ID from ESP32 status page or email.

#### Config UI — registration-focused fields

| Field | Editable? | NVS key | Notes |
|-------|-----------|---------|-------|
| **Device ID** | **Read-only** | `device_id` (from MAC) | Prominent; “use this ID when pairing in SomNet” |
| **Friendly name** | Optional text | `device_friendly_name` | e.g. “Workshop valve” — include in email to Dom |
| **Installer contact** | Optional text | `installer_contact` | Name/email for email handoff (§4.1) |
| Wi-Fi SSID / password | Yes | `wifi_ssid`, `wifi_pass` | Required for provisioning |
| SomNet server URL | Yes | `server_url` | Cloud or LAN IP of API |
| Pairing state | Read-only | — | Unpaired / paired / connected; Dom/Sub if paired |
| MAC address (raw) | Read-only | — | Secondary display for support/debug |

**Must NOT on ESP32 UI:** Sub picker, Dom login, or manual JWT entry.

Optional **“Copy setup summary”** button on status page — builds email-ready text (device ID, friendly name, installer contact, server URL).

#### Phase priority

**Config web UI moves early** (Phase 3) — immediately after NVS/MAC identity — so registration can be tested **before** full SignalR polish or relay work. See §10 phase table.

### Implementation notes

- Embed HTML in `data/config/index.html` (PROGMEM) or serve from SPIFFS/LittleFS if pages grow.
- Use `WiFiManager`-style captive portal for **first-time** setup only if desired; custom pages give more control over SomNet-specific fields.
- After POST `/config`, respond with “Saved — rebooting” and call `ESP.restart()`.
- On RUNNING, print `Config UI: http://<ip>/` to serial on connect.

### Config UI implementation phase

Added as **Phase 3** (early — before SignalR) — see §10 Implementation Phases.

---

## 5. Alignment with Existing SomNet API

The backend is **already implemented**. The ESP32 must conform to these contracts (no API changes required for MVP).

### Hub URL

```
{baseUrl}/hubs/hardware
```

Query parameters:

| Mode | Query | Auth |
|------|-------|------|
| Unpaired (await pairing) | `?deviceId={id}` | None |
| Paired | `?access_token={jwt}` | Device JWT |

JWT is passed on the query string because WebSocket clients on ESP32 cannot reliably set `Authorization` headers (same pattern as ASP.NET `OnMessageReceived` in `Program.cs`).

### Hub events (server → ESP32)

| Event | DTO | When |
|-------|-----|------|
| `PairDevice` | `PairDeviceMessageDto` | After operator calls `POST /api/devices/pair` |
| `ExecuteCommand` | `HardwareCommandMessageDto` | After operator/API sends command |

### Hub methods (ESP32 → server)

| Method | DTO | When |
|--------|-----|------|
| `AckCommand` | `HardwareCommandAckDto` | After command received/processed |

### PairDevice payload (camelCase JSON)

```json
{
  "deviceId": "esp32-abc123",
  "domTarget": "Demo Dom",
  "subTarget": "Slv66",
  "accessToken": "<jwt>",
  "expiresAt": "2027-09-05T00:00:00Z"
}
```

### ExecuteCommand payload

```json
{
  "correlationId": "a1b2c3...",
  "commandKey": "stroke",
  "accessToken": "<jwt>",
  "domTarget": "Demo Dom",
  "subTarget": "Slv66",
  "deviceId": "esp32-abc123",
  "payloadJson": "{\"powerPercent\":60,\"strokeMs\":250}"
}
```

### AckCommand payload

```json
{
  "correlationId": "a1b2c3...",
  "success": true,
  "message": "stroke 200ms complete",
  "resultJson": "{\"commandKey\":\"stroke\",\"actualStrokeMs\":200,\"powerPercent\":50}"
}
```

`resultJson` is **proposed** — not yet on `HardwareCommandAckDto` in SomNet.Shared. Required for device-as-source-of-truth UI updates (§9).

### Command keys and device execution summary

| Key | Device responsibility |
|-----|----------------------|
| `stroke` | Single relay pulse for **`strokeMs`** from payload, then open |
| `burst` | Run full burst sequence locally (N strokes × `strokeMs`, delays between) |
| `abort` | Cancel any running sequence; relay open immediately |
| `automatic-start` | Start local automatic engine from config snapshot in payload |
| `automatic-stop` | Stop automatic engine; relay open |

Detailed behavior: **§6 Device-Side Relay and Timing Execution**.

### Security checks on device (mandatory)

Before acting on `ExecuteCommand`:

1. **`deviceId`** in message matches locally stored device ID
2. **`accessToken`** in message matches token in NVS (constant-time compare if feasible)
3. **`domTarget` / `subTarget`** match NVS pairing record (if stored)
4. Device is in **paired** connection state (connected with device JWT)

Reject silently (log to serial only) if any check fails — still consider whether to ack with `success: false` (recommended for operator visibility).

---

## 6. Device-Side Relay and Timing Execution

### High-level principle

SomNet is the **control plane** (operator intent, settings, history, pairing). The ESP32 is the **execution plane** (relay, milliseconds, sequences, random automatic timing).

```
┌─────────────────────┐         ExecuteCommand          ┌─────────────────────┐
│  SomNet UI / API    │  ─── payloadJson with params ──►│  ESP32 firmware     │
│  (no hardware loop) │                                 │  (all timing here)  │
└─────────────────────┘                                 └──────────┬──────────┘
                                                                   │
                                                          relay ON for strokeMs
                                                          delays, bursts, random
                                                                   │
                                                          AckCommand when done
```

The server **must not** send repeated tick messages to hold the relay on. One command message can represent a single stroke, an entire burst, or the **configuration** to run automatic mode until stop/abort.

### Load context — air compressor valve

The relay drives an **optocoupled relay module** that switches an **air compressor valve** (or equivalent pneumatic load). In this application:

| Concept | Physical meaning |
|---------|------------------|
| **Relay ON (closed)** | Valve energized — air flow / power to load |
| **Pulse duration (`strokeMs`)** | **Directly correlates to effective power** — longer open time = more output |
| **Gap between pulses** | Idle / off time between power applications |
| **Manual mode** | Operator-chosen power → UI converts to fixed `strokeMs` per command |
| **Automatic mode** | Device **randomly** chooses both **next pulse length** and **wait until next pulse** within configured ranges |

Timing accuracy on the ESP32 is therefore safety- and behavior-critical: the firmware must deliver the requested (or randomly selected) pulse width, not an approximate block-then-guess.

### Power ↔ pulse duration mapping

Shared utility (e.g. `power_timing.h` / `PowerTiming` class) — used by automatic mode and for validation/logging in manual modes:

```cpp
// Linear map — mirrors SomNet UI computeStrokeMs()
int strokeMsFromPower(int powerPercent, int minimumStrokeMs, int maximumStrokeMs);

// Automatic: uniform random power in range, then map to ms
int randomStrokeMsFromPowerRange(int minPower, int maxPower, int minimumStrokeMs, int maximumStrokeMs);

// Automatic: uniform random ms directly in range (alternative path)
int randomStrokeMs(int minimumStrokeMs, int maximumStrokeMs);

// Automatic: random inter-pulse interval (seconds → ms)
unsigned long randomIntervalMs(int strokeMinSeconds, int strokeMaxSeconds);
```

Manual **stroke/burst** commands arrive with **`strokeMs` already computed** by the UI. Automatic mode generates **random pulse lengths and random gaps on the device** using the start payload ranges.

### Execution mode class architecture (separate by operation)

Relay GPIO logic stays **thin and mode-agnostic**. Each **incoming command type** is handled by a **dedicated execution mode class** with its own FSM, sharing a common interface and the same `relay_controller`.

```
command_handler
      │
      ├── dispatches by commandKey
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  IExecutionMode (interface)                                  │
│    start(payload) / poll() / abort() / isActive() / ...      │
└─────────────────────────────────────────────────────────────┘
      ▲              ▲                    ▲
      │              │                    │
 SinglePulseMode  BurstSequenceMode  AutomaticSessionMode
 (stroke)          (burst)            (automatic-start/stop)
      │              │                    │
      └──────────────┴────────────────────┘
                     │
              relay_controller          ← only layer that touches PIN_RELAY
              power_timing              ← ms ↔ power helpers + RNG
```

**Proposed source layout:**

```
src/
  relay_controller.*       ← GPIO + atomic timed pulse FSM (hardware only)
  power_timing.*           ← strokeMsFromPower, random helpers
  execution_context.*      ← owns active IExecutionMode*, routes poll/abort
  modes/
    i_execution_mode.h
    single_pulse_mode.*    ← commandKey: stroke
    burst_sequence_mode.*  ← commandKey: burst
    automatic_session_mode.* ← automatic-start; runs until stop/abort/end rules
  command_handler.*        ← parse ExecuteCommand → execution_context.startMode(...)
```

| Class | Responsibility | Does **not** |
|-------|----------------|--------------|
| **`relay_controller`** | Drive `PIN_RELAY`, timed pulse FSM, immediate off on abort | Parse JSON, random timing, session rules |
| **`SinglePulseMode`** | One pulse from fixed `strokeMs` in payload | Schedule bursts or random automatic strokes |
| **`BurstSequenceMode`** | Fixed count, fixed `strokeMs`, fixed inter-stroke delay from payload | Randomize timing |
| **`AutomaticSessionMode`** | Random **inter-pulse interval** and random **pulse length** (via power/ms ranges); optional random bursts; end-session rules | Touch GPIO directly |
| **`execution_context`** | Ensures one active mode; forwards `poll()`/`abort()`; completion → ack + `resultJson` | SignalR protocol |

This separation keeps automatic randomization logic out of manual paths and prevents `command_handler` from becoming a monolithic switch with intertwined timing code.

### Initial vs target implementation

| Aspect | **Initial development** (now) | **Target architecture** (documented for later) |
|--------|--------------------------------|--------------------------------------------------|
| **Command keys** | Implement **`stroke` only** end-to-end | `burst`, `automatic-start/stop`, `abort` |
| **Mode classes** | Implement **`SinglePulseMode`** + **`relay_controller`** | Full `BurstSequenceMode`, `AutomaticSessionMode` |
| **Scaffolding** | **`IExecutionMode`**, **`execution_context`**, **`command_handler`** dispatch table in place from Phase 1 scaffold | Same interfaces — no refactor when adding modes |
| **Stub behavior** | Unknown `commandKey` → log + ack `success: false` (“not implemented”) | Replace stubs with real mode classes |
| **`power_timing`** | Optional for stroke (UI sends `strokeMs`); stub file OK | Required for automatic random pulse/interval |
| **Validation focus** | Single pulse timing accuracy + SignalR coexistence | Burst sequences, dual RNG automatic, session summaries |

**Rule for initial coding:** Do not fold burst/automatic logic into `SinglePulseMode` or `relay_controller` “temporarily.” Keep §6 class boundaries even when burst/automatic `.cpp` files only contain `// TODO: Phase 8` stubs.

**Priority order after single mode works:**

1. `abort` (cancel active pulse — small extension to `execution_context`)
2. `burst` (`BurstSequenceMode`)
3. `automatic-start` / `automatic-stop` (`AutomaticSessionMode` + `power_timing`)

### Manual single stroke (`commandKey: stroke`) — **initial milestone**

In manual mode the UI maps power percent to a stroke duration using the Dom+Sub **minimum/maximum stroke ms** settings (`computeStrokeMs` in the React app). That computed value is sent to the device as **`strokeMs`**.

**Example:** At 50% power with a 25–400 ms range, the UI sends `strokeMs: 213`. If settings yield 200 ms at 50%, the payload contains **`strokeMs: 200`**.

**Device behavior:**

1. Parse `strokeMs` from `payloadJson` (required, > 0, capped e.g. at 30 s for safety)
2. **Close relay** (energize)
3. Wait **exactly** `strokeMs` milliseconds (non-blocking state machine using `millis()`)
4. **Open relay** (de-energize)
5. Send `AckCommand` with `success: true` and a **structured result** describing what actually ran (see §9.4)

The device does **not** recalculate power from percent unless `strokeMs` is omitted (fallback: reject or use safe default — prefer **require `strokeMs`** in payload).

**Proposed `payloadJson` (manual stroke):**

```json
{
  "powerPercent": 50,
  "strokeMs": 200
}
```

### Manual burst (`commandKey: burst`) — *target; stub initially*

Burst is **not** multiple server round-trips. The UI sends one message describing the full burst; the device runs the sequence internally.

**Proposed `payloadJson` (manual burst):**

```json
{
  "powerPercent": 50,
  "strokeMs": 200,
  "burstStrokes": 5,
  "burstDelayMs": 5000
}
```

| Field | Source (UI today) | Device use |
|-------|-------------------|------------|
| `strokeMs` | Computed from power % + min/max ms | Duration of **each** relay close |
| `burstStrokes` | Manual burst stroke count | Number of pulses in sequence |
| `burstDelayMs` | `burstDelaySeconds × 1000` | Idle time **between** pulses (relay open) |

**Device behavior (`BurstSequenceMode`):**

```
FOR each stroke 1..burstStrokes:
  relay ON for strokeMs
  relay OFF
  IF not last stroke: wait burstDelayMs (non-blocking)
THEN AckCommand success
```

- **Abort** during burst: cancel sequence, relay open, ack aborted if applicable
- **Ack timing:** Send `AckCommand` when the **entire burst finishes** (or fails), not after the first pulse — aligns with single ack on current API (see §9)
- Phase 1 dev: log each step to serial; Phase 5: drive relay

### Automatic mode (`automatic-start` / `automatic-stop`) — *target; stub initially*

Automatic mode requires **two independent random processes** on the device, both critical to perceived “power” at the valve:

1. **Random time between pulses** — gap before the next valve actuation (`strokeMinSeconds` … `strokeMaxSeconds` from payload).
2. **Random length of each pulse** — duration the valve stays energized, mapped from random power or random `strokeMs` within configured min/max (correlates to output strength).

The UI/API sends a **one-time config snapshot** (`AutomaticControlStateDto`); the ESP32 **generates all automatic stroke timings locally** until stop, abort, or end-session rule.

**Proposed `payloadJson` (automatic start):** mirrors shared DTO fields, camelCase:

```json
{
  "automaticMode": "randomPowerAndTiming",
  "minimumStrokeMs": 25,
  "maximumStrokeMs": 400,
  "minimumPower": 0,
  "maximumPower": 100,
  "strokeMinSeconds": 5,
  "strokeMaxSeconds": 20,
  "delayBeforeStartSeconds": 0,
  "endSessionMode": "minutes",
  "endSessionValue": 30,
  "burstsOn": true,
  "burstPercent": 10,
  "burstStyle": "fixedPowerDelay",
  "burstStrokePowerMin": 0,
  "burstStrokePowerMax": 100,
  "burstDelayMin": 1,
  "burstDelayMax": 5,
  "burstStrokesMin": 5,
  "burstStrokesMax": 10
}
```

**Device behavior (`AutomaticSessionMode`):**

| Random variable | Source fields | Device action each cycle |
|-----------------|---------------|---------------------------|
| **Wait until next pulse** | `strokeMinSeconds`, `strokeMaxSeconds` | `randomIntervalMs()` → non-blocking wait state |
| **Pulse length (power)** | `minimumPower`, `maximumPower`, `minimumStrokeMs`, `maximumStrokeMs` | Pick random power → `strokeMsFromPower()` **or** pick random ms in range |
| **Optional burst** | `burstsOn`, `burstPercent`, burst min/max fields | Delegate to nested burst sub-sequence (same `BurstSequenceMode` pattern with generated params) |
| **End session** | `endSessionMode`, `endSessionValue` | Stop engine; emit summary in stop ack `resultJson` |
| **Start delay** | `delayBeforeStartSeconds` | Initial wait before first random cycle |

**Automatic cycle (conceptual):**

```
wait random interval ──► random strokeMs (power-correlated) ──► relay pulse ──► repeat
                              │
                              └── (optional) burst sub-sequence with its own random params
```

Each completed pulse should be **logged** (serial + aggregated for stop ack): actual `strokeMs`, optional `powerPercent`, cumulative stroke count, elapsed time.

**`automatic-stop` / `abort`:** `execution_context.abort()` → cancel `AutomaticSessionMode`, relay open, ack with **device-measured** session summary (not UI estimates).

The server does **not** send per-stroke commands during automatic mode — only start/stop (and abort).

### Relay semantics

| Term | Meaning |
|------|---------|
| **Relay closed / ON / energized** | GPIO drives relay module active — load powered |
| **Relay open / OFF / de-energized** | GPIO inactive — load off |
| **Pulse** | Closed for `strokeMs`, then open |

Active-high vs active-low depends on relay module; configure in firmware constants.

### Non-blocking execution and state machines (required)

This application depends on **accurate relay timing** (exact `strokeMs`, burst gaps, automatic random intervals) while **Simultaneously** maintaining Wi-Fi, SignalR, and the config HTTP server. **Blocking calls are not acceptable** on the hot path.

#### Design rules

| Rule | Requirement |
|------|-------------|
| **No `delay()` in `loop()`** | Forbidden during command execution, hub I/O, or relay timing (brief `delay()` in `setup()` or factory reset only) |
| **Time base** | `millis()` for ms-level relay and sequence timing; `micros()` only if sub-ms precision is needed later |
| **Poll, don’t wait** | Every module exposes `poll()` (or equivalent) called once per `loop()` iteration |
| **State machines** | Stroke, burst, and automatic logic implemented as explicit **finite-state machines (FSM)**, not nested blocking loops |
| **Hub priority** | `signalr_client.poll()` runs every loop so ping/pong and inbound commands are not starved |
| **Single executor** | One primary timing pipeline at a time; overlapping commands rejected or cancelled per open decision (§15) |
| **Completion callbacks** | FSM entry/exit triggers ack + `resultJson` — never ack from inside a blocking wait |

#### Why state machines

| Operation | Without FSM (blocking) | With FSM (non-blocking) |
|-----------|------------------------|-------------------------|
| 200 ms stroke | `delay(200)` freezes SignalR | Relay ON → poll until elapsed → relay OFF |
| 5-stroke burst with 5 s gaps | ~25 s blocked loop | States: pulse → gap → pulse → … |
| Automatic mode (minutes) | Impossible in one loop | Idle → wait → pulse → wait → … for session lifetime |

#### Module state machines (proposed)

**`relay_controller`** — atomic timed pulse:

```
Idle ──startPulse(ms)──► RelayOn ──elapsed──► RelayOff ──► Idle (callback: pulse complete)
         ▲                    │
         └── abort ───────────┘
```

**`BurstSequenceMode`** — manual burst:

```
Idle ──start──► PulseOn ──► PulseOff ──► [more strokes?] ──InterDelay──► … ──► Complete ──► Idle
                  ▲                              │
                  └──────── abort ───────────────┘
```

**`AutomaticSessionMode`** — automatic session (dual random: interval + pulse length):

```
Idle ──start(config)──► StartDelay ──► WaitRandomInterval ──► PickRandomStrokeMs ──► PulseOn ──► PulseOff ──► (maybe burst sub-mode) ──► …
                           │                                         │
                           └──────── stop/abort/end ──────────────────┴──► Stopped ──► Idle (session summary ack)
```

**`execution_context`** — top-level orchestration:

```
DeviceIdle | RunningStroke | RunningBurst | AutomaticRunning | AwaitingAck
```

State enums and transition helpers live in dedicated mode headers (`modes/single_pulse_mode.h`, etc.) — not scattered magic numbers.

Use **`esp_random()`** (or Arduino `random()`) for automatic mode; seed once in `setup()` if reproducibility needed for tests.

#### Implementation sketch

```cpp
// Called every loop() — never blocks
void relay_controller_poll() {
  switch (state_) {
    case RelayState::Idle:
      break;
    case RelayState::On:
      if (millis() - onSinceMs_ >= durationMs_) {
        relayWrite(false);
        state_ = RelayState::Idle;
        if (onComplete_) onComplete_();
      }
      break;
  }
}
```

#### Testing timing quality

- Compare requested vs actual pulse length (serial log: `requested=200 actual=201` using `millis()` delta)
- Run burst while sending SignalR ping — connection must stay up
- Long automatic session soak without watchdog resets

### Serial monitor (development)

Log every transition for bring-up:

```
[STROKE] strokeMs=200 start
[RELAY] ON
[RELAY] OFF after 200ms
[STROKE] complete

[BURST] stroke 1/5 strokeMs=200
[BURST] delay 5000ms
...
[BURST] complete

[AUTO] start delay 0s
[AUTO] stroke strokeMs=187 next in 12s
[AUTO] burst injected 7 strokes
[AUTO] stop received
```

### SomNet UI/API alignment (future integration)

Today the React UI **does not yet** send `payloadJson` to `/api/devices/commands` (simulated ack), and **`SessionProvider` records strokes/bursts optimistically** from button clicks before any device confirmation. That behavior must change when hardware is integrated.

**Target flow (device as source of truth):**

```
User clicks Stroke
  → UI: command pending (no session write yet, or provisional "pending" only)
  → POST /api/devices/commands { commandKey, payloadJson }
  → Device executes → AckCommand { success, message, resultJson }
  → API forwards ack to operator (REST response + SignalR CommandAcknowledged)
  → UI: commit session/history entry from resultJson (actual ms, counts, etc.)
```

| UI action | Send in command | Record in session/history when |
|-----------|-----------------|--------------------------------|
| Manual stroke | `{ powerPercent, strokeMs }` | Device ack confirms **actualStrokeMs** |
| Manual burst | `{ powerPercent, strokeMs, burstStrokes, burstDelayMs }` | Device ack confirms **strokesCompleted**, timings |
| Automatic start | Automatic config snapshot | Optional immediate ack = "running"; summary on stop |
| Automatic stop / abort | `{ reason }` | Device ack includes **elapsed time, stroke count, end reason** |

The UI must **not** treat a button click as proof the relay fired. Failed, partial, or aborted operations are reflected from device `success` and result fields.

| UI action | Payload the UI should send |
|-----------|----------------------------|
| Manual stroke | `{ powerPercent, strokeMs }` — `strokeMs` from `computeStrokeMs()` |
| Manual burst | `{ powerPercent, strokeMs, burstStrokes, burstDelayMs }` |
| Automatic start | Full automatic settings snapshot JSON |
| Abort / stop | `{}` or `{ reason }` |

Document this contract in `SomNet.Device/docs/PROTOCOL.md` when implementing. **No SomNet code changes until approved** — this section defines the target contract for firmware and a future UI PR.

### Safety limits (firmware)

| Limit | Suggested default |
|-------|-------------------|
| Max single `strokeMs` | 30 000 ms |
| Max `burstStrokes` | 100 |
| Max `burstDelayMs` | 300 000 ms |
| Max automatic session | Respect `endSessionValue`; hard cap e.g. 24 h |

Invalid payload → `AckCommand` with `success: false` and clear `message`.

---

## 7. SignalR Client on ESP32

ASP.NET Core SignalR uses a **WebSocket transport** with a **JSON hub protocol** handshake. The ESP32 must implement a minimal client — not the full SignalR feature set.

### Connection sequence

```
1. TCP + WebSocket upgrade to /hubs/hardware?deviceId=... or ?access_token=...
2. SignalR handshake (JSON line terminated by 0x1E)
   Send:    {"protocol":"json","version":1} + 0x1E
   Receive: {"error":...} OR {} + 0x1E  (success)
3. Receive loop: messages framed with 0x1E record separator
4. Parse message type:
   - type 1 = invocation from server (PairDevice, ExecuteCommand)
   - type 6 = ping → reply pong (type 6)
   - type 7 = close → reconnect
5. Send invocations (AckCommand) as type 1 JSON messages
```

### Example server invocation (conceptual)

Incoming `ExecuteCommand` wrapper:

```json
{"type":1,"target":"ExecuteCommand","arguments":[{"correlationId":"...","commandKey":"stroke",...}]}
```

Outgoing `AckCommand`:

```json
{"type":1,"target":"AckCommand","arguments":[{"correlationId":"...","success":true,"message":"received"}]}
```

(Exact envelope format must be verified against a browser WebSocket capture during Step 0 — see §10.)

### Reconnection strategy

| State | Behavior |
|-------|----------|
| Wi-Fi lost | Pause hub; retry Wi-Fi with backoff |
| WebSocket dropped | Exponential backoff reconnect (1s → 2s → … → cap 60s) |
| Paired + valid token | Reconnect with `?access_token=` |
| Token expired / 401 / hub abort | Clear paired flag; reconnect unpaired with `?deviceId=`; wait for new `PairDevice` |
| Operator revoked pairing | Same as expired — unpaired mode |

### Keepalive

Respond to SignalR **ping** messages promptly to avoid server idle disconnect.

---

## 8. NVS Data Model

Use ESP32 **Preferences** (NVS namespace e.g. `somnet`).

| Key | Type | Description |
|-----|------|-------------|
| `device_id` | string | **`esp32-{MAC}`** — from `device_identity`; read-only in config UI |
| `device_friendly_name` | string | Optional label from config form (§4.1) |
| `installer_contact` | string | Optional name/email for email handoff to Dom |
| `wifi_ssid` | string | From config web UI or compile-time default |
| `wifi_pass` | string | From config web UI (stored in NVS; consider encryption for production) |
| `server_url` | string | SomNet API base URL (e.g. `http://192.168.1.10:5031`) — set via config UI |
| `use_tls` | bool | Use `wss`/`WiFiClientSecure` when true |
| `access_token` | string | Device JWT from `PairDevice` |
| `token_expires` | ulong | Unix ms or ISO string for expiry check |
| `dom_target` | string | From pairing message |
| `sub_target` | string | From pairing message |
| `paired` | bool | True after successful pair + token stored |
| `provisioned` | bool | True after Wi-Fi + server URL saved at least once |

### Boot flow

```
Power on
  → Load device_id (or generate and save)
  → If !provisioned OR missing wifi_ssid:
        enter PROVISIONING (Soft-AP + config web UI)
        SignalR: off until saved + reboot
  → Connect Wi-Fi (STA)
  → Start config HTTP server (status + /config)
  → Load paired + token
  → If paired && token not expired:
        connect hub with access_token
     Else:
        connect hub with device_id only
  → Run main loop (hub + HTTP + button + relay)
```

### Token refresh

Current API issues long-lived device tokens (`DeviceExpireDays`, default 365). **No refresh endpoint exists today.** On expiry, device returns to unpaired mode and waits for operator to pair again via API.

---

## 9. Command Lifecycle and Acknowledgments

### Device as source of truth (UI/API)

The completion message the ESP32 pushes to the server at the end of each command — **single stroke, burst, or automatic session segment** — is the **authoritative record** of what happened. The SomNet UI and persisted session history must be derived from that report, not from operator intent alone.

```
┌──────────────┐    ExecuteCommand     ┌──────────────┐    relay + timing    ┌──────────────┐
│  SomNet UI   │ ────────────────────► │  SomNet API  │ ───────────────────► │    ESP32     │
│  (intent)    │                       │  (dispatch)  │                      │  (execution) │
└──────────────┘                       └──────────────┘                      └──────┬───────┘
       ▲                                      ▲                                      │
       │                                      │         AckCommand + resultJson      │
       │         CommandAcknowledged          │ ◄────────────────────────────────────┘
       │         REST command response        │
       └──────── update session/history ─────┘
              only from device-reported facts
```

| Today (gap) | Target |
|-------------|--------|
| UI calls `recordManualStroke` on button click | UI waits for device ack before committing history |
| Session summary built from client event log | Summary lines built from **device `resultJson`** |
| Simulated 450 ms ack | Real `/api/devices/commands` + SignalR `CommandAcknowledged` |
| `HardwareCommandAckDto` has `message` string only | Extend with **`resultJson`** for structured actuals (approved API change) |

**Examples of device authority:**

| Scenario | UI must record |
|----------|----------------|
| Requested 200 ms stroke; device ran 200 ms | 1 stroke at stated power / 200 ms (from device) |
| Burst interrupted by abort after 3 of 5 | 3 strokes completed, aborted — not 5 |
| Automatic stop after 12 min | Session duration and counts from device stop ack |
| Command failed validation on device | No successful stroke/burst entry; show failure |

### User requirement

> Acknowledge when a message is **received**, and send follow-up so **all states are known at all times**.

### Current API limitation

SomNet today supports **one** acknowledgment per command:

- `HardwareCommandDispatcher` waits up to **10 seconds** for a **single** `AckCommand`
- First `AckCommand` for a `correlationId` completes the wait and is forwarded to the operator group

There is **no** separate “received” vs “completed” hub method yet. **`HardwareCommandAckDto` today carries only `correlationId`, `success`, and `message`** — insufficient for rich session updates without parsing free text. A structured **`resultJson`** field on the ack DTO is recommended (§9.4).

### Recommended phasing

#### Phase 1 — MVP (no SomNet code changes)

| Command | Device action | When to ack |
|---------|---------------|-------------|
| `stroke` | Single relay pulse for `strokeMs` | After relay opens |
| `burst` | Full sequence locally (see §6) | After **all** strokes and delays complete |
| `abort` / `automatic-stop` | Cancel sequences; relay open | Immediately after cancel |
| `automatic-start` | Start local engine (see §6) | After engine accepts config (optional immediate ack); session runs async |

For `stroke` and `burst`, send **one** `AckCommand` with `success`, human-readable `message`, and machine-readable **`resultJson`** (§9.4).

Operator/API see: delivered + acknowledged + success after **device-side execution** completes. **Session/history updates use `resultJson`, not the original command payload alone.**

**Trade-off:** No “received but still executing” state on server during long bursts (unless Phase 2 two-phase ack is approved).

#### Phase 2 — Two-phase ack (optional, requires approved API + UI changes)

Extend protocol (proposal for future discussion):

| Phase | New hub method (proposal) | `message` example |
|-------|---------------------------|-------------------|
| Received | `AckCommandReceived` or `AckCommand` with `phase: "received"` | `"received"` |
| Completed | `AckCommand` with `phase: "completed"` | `"relay done"` |

SomNet changes would include:

- `DeviceConnectionRegistry` tracking per-phase acks
- `HardwareCommandDispatcher` optionally waiting for completed phase
- UI showing received / executing / done

**Do not implement Phase 2 until explicitly approved.**

### Completion payload — `resultJson` (proposed)

Extend `HardwareCommandAckDto` with optional **`resultJson`** (stringified JSON, camelCase). The ESP32 populates this on every completing ack; SomNet API passes it through to REST and `CommandAcknowledged`; UI parses it to update session state.

**Manual stroke — device ack example:**

```json
{
  "correlationId": "a1b2c3",
  "success": true,
  "message": "stroke complete",
  "resultJson": "{\"commandKey\":\"stroke\",\"powerPercent\":50,\"requestedStrokeMs\":200,\"actualStrokeMs\":200}"
}
```

**Manual burst — completed:**

```json
{
  "resultJson": "{\"commandKey\":\"burst\",\"powerPercent\":50,\"strokeMs\":200,\"requestedStrokes\":5,\"strokesCompleted\":5,\"burstDelayMs\":5000,\"interrupted\":false}"
}
```

**Manual burst — aborted mid-sequence:**

```json
{
  "success": false,
  "message": "burst aborted after 3 strokes",
  "resultJson": "{\"commandKey\":\"burst\",\"requestedStrokes\":5,\"strokesCompleted\":3,\"interrupted\":true,\"reason\":\"abort\"}"
}
```

**Automatic stop — session summary from device:**

```json
{
  "resultJson": "{\"commandKey\":\"automatic-stop\",\"elapsedMs\":720000,\"totalStrokes\":42,\"burstsExecuted\":3,\"endReason\":\"stop\"}"
}
```

**Automatic mode note:** Individual random strokes during automatic run may be aggregated locally on the device and reported **once** on `automatic-stop`, `abort`, or end-session rule trigger — matching how session summaries should read in history (actual counts/duration from hardware, not UI estimates).

### SomNet changes required for source-of-truth (when approved)

| Layer | Change |
|-------|--------|
| **Shared DTO** | Add `ResultJson` to `HardwareCommandAckDto` |
| **API** | Pass `resultJson` through dispatcher response and hub `CommandAcknowledged` |
| **UI `SessionProvider`** | Defer `recordManualStroke` / burst / automatic summary until ack received |
| **UI `sessionSummary.ts`** | Build lines from parsed `resultJson` (fallback to message string during transition) |
| **UI `HardwareCommandProvider`** | Subscribe to SignalR `CommandAcknowledged` or use REST response body |

Firmware can populate `message` for logs and **`resultJson` for UI** in parallel from Phase 4 onward.

#### Phase 1 serial logging (immediate feedback)

For development visibility, log state transitions locally regardless of ack model:

```
[CMD] recv correlationId=... key=stroke
[CMD] validate OK deviceId=... dom=... sub=...
[CMD] exec stroke power=60% ms=250
[RELAY] ON 250ms
[CMD] ack success
```

---

## 10. Implementation Phases

Phase-specific **checklists** track day-to-day progress. The plan below stays the authoritative design reference; update checklist status and link back here when each phase completes.

| Phase | Focus | Checklist | Status |
|-------|--------|-----------|--------|
| **0** | Protocol verification | [Phase 0 Checklist](./09-ESP32-Phase-0-Checklist.md) | **Not started** |
| 1 | Project scaffold | *TBD when Phase 0 complete* | — |
| 2 | NVS + MAC device identity | *TBD* | — |
| **3** | **Config web UI + registration UX** | *TBD* | — |
| 4 | SignalR client + pairing | *TBD* | — |
| 5 | Single-pulse command + ack | *TBD* | — |
| 6 | Single-pulse relay | *TBD* | — |
| 7 | Resilience / production prep | *TBD* | — |
| **8** | **SomNet UI pairing dialog** + command integration | *TBD* | — |
| 9 | Burst and automatic modes | *TBD* | — |

**Rationale:** Phase **3** (config UI with MAC-based ID and friendly name) runs **before** SignalR so installers can provision network and obtain the pairing ID without Swagger/serial. Phase **8** completes Dom-side Sub association in the React app.

**Maintenance:** When a phase finishes, (1) mark its checklist sign-off, (2) update the **Status** column above, (3) add the next phase checklist document if needed.

---

### Phase 0 — Protocol verification (1–2 days)

**Checklist:** [09-ESP32-Phase-0-Checklist.md](./09-ESP32-Phase-0-Checklist.md)  
**Status:** Not started

**Summary:** Capture WebSocket/SignalR frames from `/hubs/hardware`; confirm envelopes and field names against `DeviceDtos.cs`; document in `SomNet.Device/docs/PROTOCOL.md`.

**Exit criteria:** Phase 0 checklist sign-off complete; `PROTOCOL.md` exists with redacted examples.

*Detailed steps, decisions, and capture templates are in the checklist — not duplicated here.*

---

### Phase 1 — Project scaffold (1 day)

**Deliverables:**

- [ ] Create `SomNet.Device/` folder in repo
- [ ] PlatformIO project for `esp32dev`
- [ ] `boardDefs.h`: `PIN_RELAY` (D4 / GPIO 4), `PIN_BUTTON` (D33 / GPIO 33), relay polarity
- [ ] `config.h`: server URL, feature flags (`secrets.ini` for Wi-Fi in dev)
- [ ] **Architecture skeleton (stubs OK):** `i_execution_mode.h`, `execution_context.*`, `command_handler.*`, empty `modes/burst_sequence_mode.*` and `modes/automatic_session_mode.*`
- [ ] Serial banner: firmware version, device ID, pairing state
- [ ] Wi-Fi connect with retry

**Exit criteria:** Board connects to Wi-Fi; prints device ID on serial; project compiles with mode class layout in place.

---

### Phase 2 — NVS and MAC device identity (1 day)

**Deliverables:**

- [ ] `device_identity` module: read MAC → format **`esp32-{12HEX}`** → persist `device_id`
- [ ] `nvs_store` module: token, pairing metadata, **`device_friendly_name`**
- [ ] Serial + banner prints device ID and MAC
- [ ] Factory reset hook (optional: long-press button clears NVS except MAC-derived id)

**Exit criteria:** Reboot preserves same `device_id`; MAC-based ID stable and documented for pairing.

---

### Phase 3 — Config web UI and registration UX (2–3 days) — **early priority**

**Why early:** Enables Wi-Fi/server setup and **shows MAC-based device ID + optional friendly name** before SignalR/relay work. Unblocks manual registration testing with Swagger.

**Deliverables:**

- [ ] `config_web_server` module with `ESPAsyncWebServer`
- [ ] **`/` status page:** read-only device ID, MAC, friendly name, pairing state, instructions “Pair this ID in SomNet”
- [ ] **`/config` form:** friendly name (optional), Wi-Fi, server URL; device ID **read-only**
- [ ] POST → NVS → reboot; **provisioning Soft-AP** when not provisioned
- [ ] Non-blocking HTTP alongside future SignalR (architecture ready)

**Exit criteria:** Installer configures unit from phone; device ID visible without serial; no random ID typing.

---

### Phase 4 — Minimal SignalR client + pairing (3–5 days)

**Deliverables:**

- [ ] WebSocket connect to hub (unpaired URL)
- [ ] SignalR handshake + message framing (0x1E)
- [ ] Parse `PairDevice` → save token → disconnect → reconnect paired
- [ ] Ping/pong handling
- [ ] Reconnect with exponential backoff

**Exit criteria:** End-to-end pairing via Swagger using **device ID from Phase 3 UI**; `GET /api/devices/status` shows `isConnected: true`.

---

### Phase 5 — Single-pulse command handling and ack (2–3 days)

**Scope:** **`stroke` only** — validate architecture with one mode before burst/automatic.

**Deliverables:**

- [ ] Parse `ExecuteCommand` for `commandKey: stroke`
- [ ] Validation layer (deviceId, token, dom/sub)
- [ ] `command_handler` → `execution_context` → **`SinglePulseMode`**
- [ ] Other keys (`burst`, `automatic-start`, …) → stub ack `success: false`, message `"not implemented"`
- [ ] Invoke `AckCommand` with `correlationId`, **`resultJson`** (actual `strokeMs`), and `message`
- [ ] Serial logging for every step

**Exit criteria:** Swagger `POST /api/devices/commands` with `commandKey: stroke` returns success; serial shows FSM trace (relay may still be stub).

---

### Phase 6 — Single-pulse relay and button (1–2 days)

**Scope:** **`SinglePulseMode` + `relay_controller` only** — proves non-blocking timing with SignalR.

**Deliverables:**

- [ ] **Non-blocking FSM:** `relay_controller` + `SinglePulseMode` (exact `strokeMs`)
- [ ] `execution_context.poll()` delegates to active mode
- [ ] `abort` during active stroke (relay open, cancel pulse) — minimal abort support
- [ ] Serial logging on **every state transition**
- [ ] `button_input`: debounced read; serial log on press

**Exit criteria:** Stroke at 200 ms closes relay ~200 ms then opens; SignalR stays connected during pulse; abort opens relay; serial shows FSM transitions.

---

### Phase 7 — Resilience and production prep (2–3 days)

**Deliverables:**

- [ ] Token expiry handling → unpaired fallback
- [ ] `wss://` build profile for cloud
- [ ] Watchdog for hub loop
- [ ] README: wiring diagram, flash steps, **config UI URL**, **registration / pairing procedure** (§4.1)
- [ ] Soak test: 24h reconnect stability (SignalR + config HTTP concurrent)

**Exit criteria:** Survives API restart and Wi-Fi blip; reconnects without manual re-pair if token valid.

---

### Phase 8 — SomNet UI pairing and command integration (when approved)

**Priority:** **Pair device to Sub in UI** — production registration path (§4.1).

**Deliverables:**

- [ ] **`GET /api/devices/unpaired`** — list online unpaired devices (§4.1 pending list)
- [ ] **UI pairing dialog** — **Online now** list + **paste device ID** (from email/device page); Pair → `POST /api/devices/pair`
- [ ] Optional: QR scan; show friendly name / installer contact when available
- [ ] Device status in UI (`GET /api/devices/status?subTarget=`) — connected / paired indicators
- [ ] UI replaces simulated `waitForHardwareAck` with `/api/devices/commands` **including `payloadJson` per §6**
- [ ] **`HardwareCommandAckDto.resultJson`** + pass-through on REST and SignalR
- [ ] **Session/history driven by device ack** (§9)
- [ ] SignalR client in UI for `CommandAcknowledged` with `resultJson`
- [ ] Optional: two-phase ack API extension; button uplink (TBD)

**Exit criteria:** Dom pairs device to Sub from UI using MAC-based ID from ESP32; stroke command works without Swagger.

---

### Phase 9 — Burst and automatic modes (future)

**Not part of initial development** — implement after single-pulse path is stable.

**Deliverables:**

- [ ] **`BurstSequenceMode`** — full burst FSM
- [ ] **`AutomaticSessionMode`** — dual random timing + `power_timing`
- [ ] **`abort` / `automatic-stop`** — full `execution_context` cancellation across modes
- [ ] Session summary `resultJson` on automatic stop

**Exit criteria:** Burst and automatic commands work end-to-end per §6; no refactor of `SinglePulseMode` or `relay_controller` required.

---

## 11. Pairing Procedure (Development)

### Initial device setup (ESP32 config UI — Phase 3)

1. Flash ESP32; on first boot it enters **provisioning** (Soft-AP)
2. Connect phone to device AP (or same LAN after setup)
3. Open config UI (`http://192.168.4.1` in AP mode, or LAN IP from serial)
4. Note **Device ID** (`esp32-{MAC}`) — read-only on page; copy for pairing
5. Optionally enter **friendly name** (e.g. “Workshop valve”)
6. Enter **Wi-Fi** and **SomNet server URL** (PC LAN IP for dev, e.g. `http://192.168.1.10:5031`)
7. Save and reboot — device connects to Wi-Fi; Phase 4+ opens SignalR unpaired with that device ID

### SomNet pairing — associate with Sub (Phase 4 dev / Phase 8 UI)

1. Dom logged in; **Sub selected** in header (e.g. `Slv66`)
2. Copy **Device ID** from ESP32 status page (`/` on device)
3. **Dev:** Swagger → `POST /api/devices/pair?subTarget=Slv66` with `{ "deviceId": "esp32-..." }`
4. **Production (Phase 8):** SomNet UI → Pair device → paste ID → Pair
5. ESP32 receives `PairDevice`, stores token, reconnects paired
6. Verify `GET /api/devices/status?subTarget=Slv66` → `isPaired: true`, `isConnected: true`
7. Test `POST /api/devices/commands` with `{ "subTarget": "Slv66", "commandKey": "stroke", "payloadJson": "{\"powerPercent\":60,\"strokeMs\":250}" }`

**Local network note:** ESP32 `server_url` must use the PC’s **LAN IP**, not `localhost`. The SomNet browser UI can use `localhost` on the PC; the ESP32 cannot.

---

## 12. Firmware Architecture (Modules)

### Cooperative loop (non-blocking)

All work is driven from a **single `loop()`** that returns quickly. Long operations are decomposed into **state machines** polled on each iteration (§6). Do not rely on FreeRTOS tasks for timing unless a future revision explicitly adds a dedicated worker — default is one cooperative loop.

```
main.cpp
  ├── setup: serial, NVS, mode (provisioning vs running)
  ├── setup: Wi-Fi (AP or STA), config_web_server, hub (if provisioned)
  └── loop:                    // must return quickly — no delay() here
        wifi_manager.poll()
        config_web_server.poll()   // Async; callbacks non-blocking
        signalr_client.poll()      // outbound WebSocket — every iteration
        execution_context.poll()   // delegates to active IExecutionMode
        relay_controller.poll()    // atomic GPIO pulse FSM (used by all modes)
        button_input.poll()

Callbacks (async completion — not from blocking code):
  onPairDevice(msg)     → nvs_store.savePairing → hub.reconnect(paired)
  onExecuteCommand(msg) → command_handler → execution_context.startMode(...)
  onModeComplete(mode)  → hub.ackCommand + resultJson (stroke / burst / automatic summary)
  onConfigSaved()       → nvs_store.saveWifiAndServer → ESP.restart()
```

**Important:** `hub.ackCommand()` is invoked from **FSM completion callbacks** only (§9), not from `onExecuteCommand` while timing is still in progress.

### Threading

Prefer **single-threaded cooperative `loop()`** with FSM-based timing (`millis()`). `ESPAsyncWebServer` uses AsyncTCP; **`delay()` must not appear in `loop()` or FSM poll paths** — SignalR ping/pong, command delivery, and relay timing accuracy all depend on continuous polling.

Optional: ESP32 runs FreeRTOS under Arduino, but **default design stays one `loop()` task** unless profiling shows hub starvation; avoid `vTaskDelay` in command paths for the same reasons as `delay()`.

---

## 13. Testing Strategy

| Level | Method |
|-------|--------|
| **Unit** | Extract JSON parse/validate into testable functions (PlatformIO native tests optional) |
| **Hub integration** | Swagger + serial trace correlation |
| **Negative tests** | Wrong token in message, wrong deviceId, expired JWT, command while unpaired |
| **Network** | API stopped/started, Wi-Fi AP reboot, weak signal |
| **Config UI** | Save Wi-Fi/server while SignalR connected; provisioning AP → STA transition |
| **Hardware** | Multimeter/LED on relay pin; timed pulse matches `strokeMs` (±1 ms jitter) |
| **Timing** | Oscilloscope or logic analyzer on GPIO for 200 ms stroke; burst interval spacing |

### Success metrics (Phase 4+)

- Pairing succeeds within 5 s of API call
- Command ack within 500 ms for serial-only stub; within command timeout for relay pulse
- Zero false accepts of commands for other device IDs (manual test with forged payload)

---

## 14. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Blocking `delay()` in command path | SignalR drop, bad timing | FSM + `millis()`; code review / grep for `delay(` in `src/` |
| SignalR message format mismatch | No commands parsed | Protocol doc from live capture before coding parser |
| JWT too large for query string | Connect fails | Verify token length; server config already uses query `access_token` |
| Single ack vs two-phase requirement | UX gap | Phase 1 single ack; document Phase 2 API proposal |
| Local dev uses HTTP not HTTPS | Different from prod | Separate PlatformIO environments |
| Relay noise on Wi-Fi GPIO | Unreliable RF | Separate relay supply; avoid strapping pins; keep GPIO configurable |
| Cloud multi-instance API | Hub on wrong instance | Future: Azure SignalR Service (noted in Dev Guide) |
| HTTP + WebSocket RAM pressure | Crashes or disconnects | Minimal HTML; monitor heap; avoid large request bodies |
| Config UI left open on LAN | Local unauthorized changes | Button-gated config mode; optional simple PIN |
| User port-forwards ESP32 HTTP | WAN exposure of setup page | Document “do not forward”; no remote admin in Phase 1 |

---

## 15. Open Decisions (Resolve Before Coding)

| # | Question | Options |
|---|----------|---------|
| 1 | Repo name/location | **`SomNet.Device/` in repo** — confirmed |
| 2 | Relay active level | Active-low vs active-high module |
| 3 | Device ID format | **`esp32-{MAC}`** — confirmed (§4.1) |
| 4 | Phase 1 ack timing | Ack after full execution vs immediate (MVP = after execution) |
| 5 | Two-phase ack | Defer to Phase 2 API change vs accept single ack for now |
| 6 | Burst command | Log only vs sequential relay pulses in Phase 1 |
| 7 | Certificate pinning | Required for prod or trust store only |
| 8 | Config UI access control | Open `/config` on LAN vs button-gated vs time-limited |
| 9 | Wi-Fi credentials in NVS | Plaintext vs ESP32 flash encryption |
| 10 | Provisioning UX | Soft-AP captive portal vs BLE vs serial-only for dev |
| 11 | Command overlap | Reject new stroke/burst while sequence running vs queue |
| 12 | Missing `strokeMs` in payload | Reject vs compute from powerPercent on device (prefer reject) |
| 13 | Automatic stroke reporting | Per-stroke acks vs aggregated summary only on stop |
| 14 | Failed command in UI | Show error only vs write "failed attempt" to session history |
| 15 | Automatic pulse randomization | Random power→ms vs random ms directly in range (or both per config) |
| 16 | Burst inside automatic | Nested class vs `AutomaticSessionMode` calling `BurstSequenceMode` |

---

## 16. Document Maintenance

**Phase progress:** Update [phase checklist documents](./09-ESP32-Phase-0-Checklist.md) and the status table in §10 as work completes.

When the device repo is created:

1. Add link in [Documents/README.md](./README.md) to this plan and active phase checklists
2. Add “Related repositories” entry in root [README.md](../README.md)
3. Copy protocol examples into `SomNet.Device/docs/PROTOCOL.md` after Phase 0 (per [Phase 0 Checklist](./09-ESP32-Phase-0-Checklist.md))
4. Update [06-SignalR-And-Hardware.md](./06-SignalR-And-Hardware.md) with “firmware repo” link when available

---

## 17. Summary Checklist

**Planning complete when:**

- [x] Goals mapped to existing API capabilities
- [x] Outbound-only network model documented
- [x] NVS schema defined
- [x] SignalR approach and phases defined
- [x] Ack lifecycle gap vs current API documented
- [x] Repository placement recommended
- [x] Device-side relay timing model documented (stroke, burst, automatic)
- [x] Device-reported source of truth for UI/session history documented
- [x] Device registration model documented (ESP32 config UI + MAC ID + SomNet Sub pairing §4.1)
- [x] Execution mode class split (single / burst / automatic) documented
- [x] Automatic dual random timing (interval + pulse length) documented
- [x] On-device config web UI requirements and SignalR coexistence documented
- [x] Implementation phases with exit criteria listed

**Ready to implement when:**

- [x] PlatformIO extension installed and active in Cursor
- [x] Hardware target confirmed: ESP32 DevKit V1 clone → `board = esp32dev`
- [x] Wiring confirmed: relay **D4**, button **D33** → constants in `boardDefs.h`
- [x] No external status LEDs; relay module has optocoupler + built-in LED(s)
- [ ] Open decisions in §15 resolved
- [ ] [Phase 0 checklist](./09-ESP32-Phase-0-Checklist.md) complete — see §10 status table
- [ ] `SomNet.Device` repository created
- [ ] Explicit approval to begin firmware (and any API changes for two-phase ack)
