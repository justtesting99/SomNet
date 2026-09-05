# ESP32 Device Project — Plan of Action

This document defines the plan for a standalone Arduino/ESP32 firmware project that connects outbound to the SomNet API via SignalR, stores pairing credentials in NVS, drives a relay output with **device-side timing**, and reports command lifecycle back to the server.

**Core execution principle:** The SomNet UI/API sends **parameters** (e.g. `strokeMs`, burst counts, delays, automatic config). The ESP32 **executes all timing locally** — relay close duration, inter-stroke delays, random automatic schedules — without the server driving real-time hardware loops.

**Source-of-truth principle:** What the UI/API **records** about strokes, bursts, and automatic sessions must reflect **what the device actually did**, as reported in the completion message (`AckCommand`) after each command — not what the UI assumed when the button was pressed.

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
| 6 | **On-device configuration web UI** | Lightweight pages served by the ESP32 HTTP server for Wi-Fi and SomNet server settings (see §4) |
| 7 | **Device-side timing execution** | Relay and sequence timing run entirely on the ESP32 from message payload data (see §6) |
| 8 | **Device-reported history** | Completion ack from device updates API/UI session state — device is authoritative (see §9) |

### Non-Goals (Phase 1)

- OTA firmware updates
- Offline command queue
- SomNet UI pairing dialog (pair via Swagger/API during dev; device UI shows ID only)
- Changes to SomNet backend or frontend (unless a protocol gap is approved)
- Full-featured device admin portal (keep config UI minimal)

### Hardware (Phase 1)

| Component | Role | Notes |
|-----------|------|-------|
| **ESP32 dev board** | Main controller | ESP32-WROOM or similar; Wi-Fi required |
| **Relay module** | Output | Single relay on one GPIO; **energized (closed) for exact `strokeMs` from message**, then de-energized |
| **Push button** | Input (future) | One GPIO with internal pull-up; debounce in firmware; no server action in Phase 1 |
| **USB serial** | Development | 115200 baud Serial Monitor for state and command logging |

Suggested starting pins (configurable constants, not fixed in this plan):

| Signal | Suggested GPIO | Direction |
|--------|----------------|-----------|
| Relay control | GPIO 26 | Output |
| User button | GPIO 27 | Input (pull-up) |

---

## 2. Repository and Project Layout

### Recommendation: Separate repository (sibling to SomNet)

The ESP32 firmware is a **C++/Arduino/PlatformIO** project. It does not belong inside the .NET solution and should not be forced into `SomNet.slnx`.

**Recommended layout:**

```
D:\MoreRepos\
├── SomNet\                    ← Existing .NET + React repo (unchanged)
│   └── Documents\
│       └── 09-ESP32-Device-Plan.md   ← This document
│
└── SomNet.Device\             ← New repo (proposed name)
    ├── README.md              ← Flash instructions, wiring, env config
    ├── platformio.ini         ← PlatformIO project (recommended)
    ├── include/
    │   └── config.h           ← Server URL, GPIO pins, feature flags
    ├── src/
    │   ├── main.cpp
    │   ├── wifi_manager.*
    │   ├── nvs_store.*
    │   ├── device_identity.*
    │   ├── signalr_client.*
    │   ├── command_handler.*
    │   ├── sequence_executor.*    ← Burst / timed multi-step sequences (non-blocking)
    │   ├── automatic_engine.*     ← Automatic mode: random timing locally from config snapshot
    │   ├── relay_controller.*
    │   ├── button_input.*
    │   └── config_web_server.*
    ├── data/
    │   └── config/              ← Embedded HTML/CSS (PROGMEM or LittleFS)
    └── docs/
        └── PROTOCOL.md          ← Copy/summary of hub message contracts
```

### Why not inside SomNet?

| Approach | Verdict |
|----------|---------|
| **Sibling repo `SomNet.Device`** | **Recommended** — separate toolchain (PlatformIO vs .NET), separate CI, clear ownership |
| **Git submodule** `SomNet/devices/esp32` | Acceptable if you want one clone URL; adds submodule complexity |
| **Folder inside SomNet** `SomNet.Device/` at repo root | Acceptable for small teams; keep out of `.slnx`; document in root README |
| **Inside `SomNet.API`** | **Avoid** — wrong technology stack |

### Linking the two repos

- SomNet `Documents/` references `SomNet.Device` README and protocol
- SomNet.Device README links back to `SomNet/Documents/06-SignalR-And-Hardware.md`
- Optional: git submodule or a short “Related repositories” section in root `README.md` when the device repo exists

### Toolchain choice

**PlatformIO (recommended)** over Arduino IDE alone:

- Reproducible builds and library pinning
- Multiple environments (`dev_local`, `prod_cloud`) via `platformio.ini`
- Easier CI later (GitHub Actions)

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
| `/` | GET | Status dashboard: device ID, Wi-Fi, server URL, pairing state, hub connection, last error |
| `/config` | GET | Communication settings form |
| `/config` | POST | Save Wi-Fi SSID/password, server base URL, optional TLS flag → NVS → reboot |
| `/config/reset-wifi` | POST | Clear Wi-Fi + server URL; enter provisioning mode |
| `/config/factory-reset` | POST | Clear all NVS including pairing token; reboot to provisioning |
| `/api/status` | GET | JSON status (optional, for simple polling from same pages) |

**Fields on `/config` form:**

| Field | Stored in NVS | Notes |
|-------|---------------|-------|
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

No changes to SomNet are **required** for the device config UI. Optional future enhancement: SomNet pairing dialog could link to “configure device network” help text pointing users to the ESP32 setup URL.

### Implementation notes

- Embed HTML in `data/config/index.html` (PROGMEM) or serve from SPIFFS/LittleFS if pages grow.
- Use `WiFiManager`-style captive portal for **first-time** setup only if desired; custom pages give more control over SomNet-specific fields.
- After POST `/config`, respond with “Saved — rebooting” and call `ESP.restart()`.
- On RUNNING, print `Config UI: http://<ip>/` to serial on connect.

### Config UI implementation phase

Added as **Phase 5a** (after SignalR works, before or parallel with relay hardware) — see §10 Implementation Phases.

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

### Manual single stroke (`commandKey: stroke`)

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

### Manual burst (`commandKey: burst`)

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

**Device behavior (`sequence_executor`):**

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

### Automatic mode (`automatic-start` / `automatic-stop`)

Automatic mode timing is **randomized on the device** according to parameters in the start payload. The UI/API sends a **snapshot** of `AutomaticControlStateDto` (minus runtime-only `running` flag); the ESP32 runs until stop, abort, end-session rules, or disconnect.

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

**Device behavior (`automatic_engine`):**

| Parameter area | Executed on ESP32 |
|----------------|-------------------|
| Inter-stroke interval | Random between `strokeMinSeconds` and `strokeMaxSeconds` |
| Stroke duration | Random `strokeMs` between `minimumStrokeMs` and `maximumStrokeMs`, or mapped from random power in range |
| Bursts | When `burstsOn`, inject burst sequences at `burstPercent` probability with random strokes/delays in min/max ranges |
| End session | Stop when `endSessionMode` satisfied (minutes elapsed, stroke count, or never until stop) |
| Start delay | Wait `delayBeforeStartSeconds` before first stroke |

**`automatic-stop` / `abort`:** Stop engine, cancel pending timers, relay open, ack immediately.

The server does **not** send per-stroke commands during automatic mode — only start/stop (and abort).

### Relay semantics

| Term | Meaning |
|------|---------|
| **Relay closed / ON / energized** | GPIO drives relay module active — load powered |
| **Relay open / OFF / de-energized** | GPIO inactive — load off |
| **Pulse** | Closed for `strokeMs`, then open |

Active-high vs active-low depends on relay module; configure in firmware constants.

### Non-blocking execution (critical)

Long sequences (burst, automatic) **must not** block the main loop:

- Use `relay_controller` + `sequence_executor` + `automatic_engine` state machines polled from `loop()`
- Continue processing SignalR ping/pong and WebSocket reads during waits
- Only one **primary** sequence at a time; new `stroke` during burst queues or rejects (open decision: **reject with ack failure** recommended)

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
| `device_id` | string | Stable UUID or MAC-derived ID; generated once on first boot |
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

### Phase 0 — Protocol verification (1–2 days)

**Deliverables:**

- [ ] Capture WebSocket frames from browser or test client against local `/hubs/hardware`
- [ ] Document exact handshake bytes and `ExecuteCommand` / `PairDevice` envelope
- [ ] Confirm camelCase JSON field names match `DeviceDtos.cs`
- [ ] Pair test device via Swagger `POST /api/devices/pair` while ESP32 serial logs raw frames (even pre-parser)

**Exit criteria:** Written `PROTOCOL.md` in device repo with captured examples.

---

### Phase 1 — Project scaffold (1 day)

**Deliverables:**

- [ ] Create `SomNet.Device` repo (or agreed folder)
- [ ] PlatformIO project for `esp32dev`
- [ ] `config.h`: Wi-Fi SSID/password (or `secrets.ini`), server URL, GPIO pins
- [ ] Serial banner: firmware version, device ID, pairing state
- [ ] Wi-Fi connect with retry

**Exit criteria:** Board connects to Wi-Fi; prints device ID on serial.

---

### Phase 2 — NVS and device identity (1 day)

**Deliverables:**

- [ ] `device_identity` module: generate/read persistent `device_id`
- [ ] `nvs_store` module: read/write token, pairing metadata
- [ ] Factory reset hook (optional: long-press button clears NVS)

**Exit criteria:** Reboot preserves same `device_id`; NVS round-trip tests via serial commands.

---

### Phase 3 — Minimal SignalR client (3–5 days)

**Deliverables:**

- [ ] WebSocket connect to hub (unpaired URL)
- [ ] SignalR handshake + message framing (0x1E)
- [ ] Parse `PairDevice` → save token → disconnect → reconnect paired
- [ ] Ping/pong handling
- [ ] Reconnect with exponential backoff

**Exit criteria:** End-to-end pairing via Swagger while ESP32 stores token and reconnects as paired; `GET /api/devices/status` shows `isConnected: true`.

---

### Phase 4 — Command handling and ack (2–3 days)

**Deliverables:**

- [ ] Parse `ExecuteCommand`
- [ ] Validation layer (deviceId, token, dom/sub)
- [ ] `command_handler`: dispatch by `commandKey`
- [ ] Invoke `AckCommand` with matching `correlationId`, **`resultJson`**, and `message`
- [ ] Serial logging for every step

**Exit criteria:** `POST /api/devices/commands` from Swagger returns `delivered: true`, `acknowledged: true`, `success: true`; serial shows full trace.

---

### Phase 5a — On-device configuration web UI (2–3 days)

**Deliverables:**

- [ ] `config_web_server` module with `ESPAsyncWebServer`
- [ ] Embedded pages: `/` status dashboard, `/config` form (Wi-Fi + server URL)
- [ ] POST handlers → NVS → reboot
- [ ] **Provisioning mode:** Soft-AP + captive portal when not provisioned
- [ ] **Running mode:** status page while SignalR remains connected
- [ ] Button hold → factory reset or re-enter provisioning (optional)
- [ ] Prominent **device ID** on status page for SomNet pairing

**Exit criteria:** Configure Wi-Fi and server URL from phone browser without re-flash; device reconnects to hub after reboot; SignalR and HTTP server run concurrently in RUNNING mode.

---

### Phase 5 — Relay, sequences, and button (2–4 days)

**Deliverables:**

- [ ] `relay_controller`: non-blocking ON/OFF; timed pulse for exact `strokeMs`
- [ ] `sequence_executor`: manual burst (N × pulse + inter-stroke delays) per §6
- [ ] `automatic_engine`: random inter-stroke intervals, stroke ms, optional bursts from start payload (§6)
- [ ] `abort` / `automatic-stop` → cancel engines; relay open immediately
- [ ] Serial logging for every stroke, delay, and state transition
- [ ] `button_input`: debounced read; serial log on press (no API uplink yet)

**Exit criteria:** Stroke at 200 ms closes relay exactly 200 ms then opens; 5-stroke burst runs full sequence from one command; automatic start runs locally until stop; abort mid-sequence opens relay.

---

### Phase 6 — Resilience and production prep (2–3 days)

**Deliverables:**

- [ ] Token expiry handling → unpaired fallback
- [ ] `wss://` build profile for cloud
- [ ] Watchdog for hub loop
- [ ] README: wiring diagram, flash steps, **config UI URL**, pairing procedure
- [ ] Soak test: 24h reconnect stability (SignalR + config HTTP concurrent)

**Exit criteria:** Survives API restart and Wi-Fi blip; reconnects without manual re-pair if token valid.

---

### Phase 7 — SomNet integration (when approved)

**Not in scope until requested:**

- [ ] UI pairing dialog (device ID display + pair button)
- [ ] UI replaces simulated `waitForHardwareAck` with `/api/devices/commands` **including `payloadJson` per §6**
- [ ] **`HardwareCommandAckDto.resultJson`** + pass-through on REST and SignalR
- [ ] **Session/history driven by device ack** — remove optimistic `recordManualStroke` on click; commit on ack (§9)
- [ ] SignalR client in UI for `CommandAcknowledged` with `resultJson`
- [ ] Optional two-phase ack API extension
- [ ] Button → uplink event (new hub method TBD)

---

## 11. Pairing Procedure (Development)

### Initial device setup (config web UI)

1. Flash ESP32; on first boot it enters **provisioning** (Soft-AP or serial instructions)
2. Connect phone/PC to device AP or same LAN after setup
3. Open config UI (`http://192.168.4.1` in AP mode, or URL shown on serial)
4. Enter **Wi-Fi SSID/password** and **SomNet server URL** (PC LAN IP for local dev, e.g. `http://192.168.1.10:5031`)
5. Save and reboot — device connects to Wi-Fi and opens outbound SignalR (unpaired)

### SomNet pairing (API / future UI)

1. Note **device ID** from config UI status page or serial log
2. Start SomNet API locally (`http://localhost:5031`) or use cloud URL configured on device
3. Login as Dom (demo/demo); ensure target Sub exists
4. Open Swagger → `POST /api/devices/pair?subTarget=Slv66` with body `{ "deviceId": "<from device>" }`
5. ESP32 receives `PairDevice`, writes NVS, reconnects
6. Verify `GET /api/devices/status?subTarget=Slv66` → `isPaired: true`, `isConnected: true`
7. Test `POST /api/devices/commands` with `{ "subTarget": "Slv66", "commandKey": "stroke", "payloadJson": "{\"powerPercent\":60,\"strokeMs\":250}" }`

**Local network note:** ESP32 `server_url` must use the PC’s **LAN IP**, not `localhost`. The SomNet browser UI can use `localhost` on the PC; the ESP32 cannot.

---

## 12. Firmware Architecture (Modules)

```
main.cpp
  ├── setup: serial, NVS, mode (provisioning vs running)
  ├── setup: Wi-Fi (AP or STA), config_web_server, hub (if provisioned)
  └── loop:
        wifi_manager.poll()
        config_web_server.poll()   // Async; callbacks non-blocking
        signalr_client.poll()      // outbound WebSocket
        relay_controller.poll()    // strokeMs timer → open relay
        sequence_executor.poll()   // burst steps + delays
        automatic_engine.poll()    // random timing when automatic running
        button_input.poll()

Callbacks:
  onPairDevice(msg)     → nvs_store.savePairing → hub.reconnect(paired)
  onExecuteCommand(msg) → validate → command_handler
                              ├─ stroke  → relay_controller.pulse(strokeMs) → ack + resultJson when done
                              ├─ burst   → sequence_executor.start(...) → ack + resultJson when done
                              ├─ automatic-start → automatic_engine.start(payload) → ack
                              ├─ abort / automatic-stop → cancel all → ack + resultJson (actual counts/elapsed)
  onConfigSaved()       → nvs_store.saveWifiAndServer → ESP.restart()
```

**Important:** `onExecuteCommand` must not call `hub.ackCommand()` until the **device-side work** for that command is finished (see §9), except for immediate cancel/stop cases.

### Threading

Prefer **single-threaded loop** on Arduino (`loop()`) with non-blocking relay timing (`millis()`). `ESPAsyncWebServer` handles HTTP on AsyncTCP; do not block the loop with long `delay()` calls — SignalR ping/pong and reconnect logic depend on frequent `signalr_client.poll()`.

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
| No stable SignalR library for ESP32 | Schedule slip | Budget time for custom minimal client; Phase 0 capture |
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
| 1 | Repo name/location | `SomNet.Device` sibling vs submodule vs folder in SomNet |
| 2 | Relay active level | Active-low vs active-high module |
| 3 | Device ID format | UUID vs `esp32-{mac}` |
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

---

## 16. Document Maintenance

When the device repo is created:

1. Add link in [Documents/README.md](./README.md) to this plan
2. Add “Related repositories” entry in root [README.md](../README.md)
3. Copy protocol examples into `SomNet.Device/docs/PROTOCOL.md` after Phase 0
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
- [x] On-device config web UI requirements and SignalR coexistence documented
- [x] Implementation phases with exit criteria listed

**Ready to implement when:**

- [ ] Open decisions in §15 resolved
- [ ] Phase 0 protocol capture done
- [ ] `SomNet.Device` repository created
- [ ] Explicit approval to begin firmware (and any API changes for two-phase ack)
