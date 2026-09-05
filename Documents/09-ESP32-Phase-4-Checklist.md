# ESP32 Firmware — Phase 4 Checklist

Minimal **SignalR hub client** and **device pairing** — unpaired WebSocket connect, `PairDevice` → NVS token, reconnect paired, ping/pong, reconnect with backoff.

**Parent plan:** [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §4.1, §7, §8, §10  
**Protocol reference:** [`SomNet.Device/docs/PROTOCOL.md`](../SomNet.Device/docs/PROTOCOL.md)  
**Prior phase:** [09-ESP32-Phase-3-Checklist.md](./09-ESP32-Phase-3-Checklist.md) (complete)  
**Status:** **Complete** (2026-09-05)  
**Target output:** Device connects to `/hubs/hardware`; Dom pairs to `Slv66`; `GET /api/devices/status` shows `isConnected: true` — verified via SomNet UI (Options) and Swagger (Authorize + status)

---

## Phase 4 at a glance

| Item | Value |
|------|--------|
| **Goal** | Outbound SignalR JSON client + end-to-end pairing (unpaired → `PairDevice` → paired reconnect) |
| **Duration** | 3–5 days |
| **Hardware scope** | Same DevKit; no relay actuation required for exit criteria |
| **Software scope** | `signalr_client`, negotiate HTTP, WebSocket, 0x1E framing, NVS pairing persistence |
| **Explicitly out of scope** | `ExecuteCommand` / `AckCommand`, relay FSM, token-expiry fallback, `wss://`, SomNet React UI |
| **Blocks** | Phase 5 (command handling) until exit criteria met |

Update **Status** above and check boxes below as work completes. When Phase 4 is done, update the status line in [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 Phase 4.

---

## Prerequisites

### Completed upstream

- [x] Phase 3 complete — [09-ESP32-Phase-3-Checklist.md](./09-ESP32-Phase-3-Checklist.md)
- [x] Device **fully provisioned** (Wi-Fi + `server_url` in NVS) or dev `secrets.ini` + UI save
- [x] **Device ID** visible on `http://<device-ip>/` — copy for pairing test
- [x] Phase 0 complete — [PROTOCOL.md](../SomNet.Device/docs/PROTOCOL.md) reviewed (§1–5, §11)
- [x] Review plan §7 (SignalR client), §8 (NVS pairing keys), §4.1 (registration flow)

### Developer environment

- [x] SomNet API running and reachable from ESP32 LAN (`dotnet run` — `http` profile, default port **5031**)
- [x] `server_url` on device points to **PC LAN IP** (not `localhost`)
- [x] Swagger: `http://<api-host>:5031/swagger` (+ JWT **Authorize** for protected endpoints)
- [x] Demo Dom login works (`demo` / `demo` or your test account)
- [x] Target Sub exists (e.g. `Slv66`)
- [x] Serial monitor at 115200 baud
- [ ] Optional: re-run `SomNet.Device/tools/phase0-capture.mjs` if API pairing behavior changed (not required for sign-off)

### Current stubs (Phase 3)

| Module | Today | Phase 4 target |
|--------|--------|----------------|
| `signalr_client.*` | Full hub client FSM | Done (Phase 4) |
| `nvs_store.*` | `savePairing()` / `clearPairing()` | Done (Phase 4) |
| `main.cpp` | Hub poll when RUNNING + provisioned | Done (Phase 4) |
| `config_pages` status | Live hub state | Done (Phase 4) |

---

## Decisions (set before coding)

| # | Decision | Options | Choice | Date |
|---|----------|---------|--------|------|
| P4-D1 | **WebSocket library** | `links2004/WebSockets` / ESP-IDF native / other | ☑ `links2004/WebSockets` | 2026-09-05 |
| P4-D2 | **JSON library** | `bblanchon/ArduinoJson` static doc / manual parse | ☑ ArduinoJson static doc | 2026-09-05 |
| P4-D3 | **JWT / token buffer size** | 128 (too small) / **512** / 768 | ☑ **512** | 2026-09-05 |
| P4-D4 | **`expiresAt` storage** | ISO string in NVS / parse to `token_expires` (ulong ms) | ☑ Parse ISO → `token_expires` ms | 2026-09-05 |
| P4-D5 | **Firmware version** | e.g. `0.4.0-phase4` | `0.4.0-phase4` | 2026-09-05 |
| P4-D6 | **Hub start gate** | When Wi-Fi connected + fully provisioned + not Soft-AP | ☑ Yes | 2026-09-05 |
| P4-D7 | **Transport (dev)** | `ws://` from `http://` server URL | ☑ `ws://` only (Phase 7: `wss`) | 2026-09-05 |
| P4-D8 | **Reconnect backoff** | 1s → 2s → … cap 60s | ☑ 1s → 60s cap | 2026-09-05 |
| P4-D9 | **Re-negotiate** | New negotiate POST on every reconnect attempt | ☑ Yes | 2026-09-05 |
| P4-D10 | **JWT in WS URL** | URL-encode `access_token` query value | ☑ URL-encode | 2026-09-05 |
| P4-D11 | **`ExecuteCommand` if received** | Ignore / log only / stub ack | ☑ Log + ignore (Phase 5) | 2026-09-05 |
| P4-D12 | **Serial log prefix** | `[HUB]` / `[SIG]` / `[WS]` | `[HUB]` | 2026-09-05 |
| P4-D13 | **PairDevice reconnect** | Disconnect WS → save NVS → negotiate → connect paired | ☑ Yes | 2026-09-05 |
| P4-D14 | **HTTP negotiate client** | `HTTPClient` (Arduino) / custom | ☑ `HTTPClient` | 2026-09-05 |
| P4-D15 | **Pairing test Sub** | e.g. `Slv66` | `Slv66` | 2026-09-05 |
| P4-D16 | **Paired auth rejected (type 7)** | Retry / clear pairing / stop | ☑ `clearPairing()` → unpaired reconnect | 2026-09-05 |

### Confirmed (no Phase 4 decision needed)

- Hub path: `/hubs/hardware` — append to parsed host/port from NVS `server_url` (no suffix in stored URL)
- Unpaired WS query: `id={connectionToken}&deviceId={localDeviceId}`
- Paired WS query: `id={connectionToken}&access_token={deviceJwt}`
- Handshake send: `{"protocol":"json","version":1}` + **`0x1E`**
- Handshake success: `{}` + **`0x1E`**
- `PairDevice` field names: camelCase per `PairDeviceMessageDto` (`deviceId`, `domTarget`, `subTarget`, `accessToken`, `expiresAt`)
- Firmware must verify incoming `deviceId` matches local identity before saving token
- Pairing operator flow: Swagger `POST /api/devices/pair?subTarget=…` with Dom JWT — **not** on ESP32 UI
- NVS key names ≤ **15 characters** (see Phase 3 lesson — `access_token`, `dom_target`, `sub_target`, `token_expires`)
- SignalR stays **off** in PROVISIONING / Soft-AP mode
- Config HTTP server must keep working while hub is connected (non-blocking `loop()`)

---

## A. PlatformIO dependencies and build

- [x] Add `lib_deps` (per P4-D1, P4-D2):
  - WebSocket client library
  - `ArduinoJson` (if chosen)
- [x] Bump `FIRMWARE_VERSION` (P4-D5) in `platformio.ini`
- [x] `pio run` succeeds with new libs
- [x] No new `delay()` in `signalr_client` hot path (plan §6)

**Notes:**

```
lib_deps versions used:
  links2004/WebSockets @ ^2.4.2
  bblanchon/ArduinoJson @ ^7.2.0

Build warnings:
  ArduinoJson StaticJsonDocument deprecation (non-blocking)```

---

## B. Server URL parsing

Parse NVS `server_url` (e.g. `http://192.168.1.100:5031`) for hub client use.

- [x] Extract **host** and **port** (default 5031 if omitted)
- [x] Build negotiate URL: `http://{host}:{port}/hubs/hardware/negotiate?negotiateVersion=1`
- [x] Build WebSocket URL: `ws://{host}:{port}/hubs/hardware` (P4-D7)
- [x] Reject or defer `https://` + `use_tls` until Phase 7 (log clear message)
- [x] Unit-test or serial-log parsed URLs once at hub start (redact in docs)

---

## C. HTTP negotiate

- [x] POST negotiate with empty JSON body `{}` and `Content-Type: application/json`
- [x] Parse JSON response for `connectionToken` (required)
- [x] Handle HTTP errors (log status code, schedule reconnect)
- [x] Timeout bounded (do not block `loop()` for tens of seconds)

**Expected (dev):**

```http
POST http://{host}:5031/hubs/hardware/negotiate?negotiateVersion=1
→ 200 { "connectionToken": "...", "connectionId": "...", ... }
```

---

## D. WebSocket connect

### D.1 Unpaired mode

When `!nvs.isPaired()` or no valid token:

- [x] After negotiate, connect: `ws://…/hubs/hardware?id={connectionToken}&deviceId={deviceId}`
- [x] `deviceId` matches `device_identity.deviceId()` (uppercase MAC form)
- [x] Perform SignalR handshake (§E)
- [x] Connection stays open (not immediate `type:7` close)

### D.2 Paired mode

When `nvs.isPaired()` and non-empty `access_token`:

- [x] Connect: `ws://…/hubs/hardware?id={connectionToken}&access_token={jwt}`
- [x] URL-encode JWT query value (P4-D10)
- [x] Handshake succeeds; server registers paired device

### D.3 Invalid / rejected

- [x] On `{}` then `{"type":7}` — log, backoff, retry (unpaired if token bad)

---

## E. SignalR handshake and framing

- [x] Send handshake frame + **`0x1E`**
- [x] Receive buffer accumulates bytes; split frames on **`0x1E`**
- [x] Ignore empty frames between separators
- [x] Parse JSON per frame; handle at minimum:
  - `{}` — handshake OK
  - `{"type":6}` — ping → reply `{"type":6}` + **`0x1E`**
  - `{"type":7}` — close → disconnect + reconnect
  - `{"type":1,"target":"PairDevice",...}` — §G
  - `{"type":1,"target":"ExecuteCommand",...}` — log only (P4-D11)

---

## F. `signalr_client` module

Replace stub with non-blocking FSM.

- [x] `begin(NvsStore*, DeviceIdentity*, WifiManager*)` — store dependencies
- [x] `poll()` — drive connect / read / reconnect; **returns immediately**
- [x] `hubState()` or equivalent for status UI (Disconnected / Negotiating / Unpaired / Paired / Reconnecting)
- [x] `isConnected()` — true when WS open and handshake complete
- [x] No heap churn every frame (reuse buffers where possible)

**Suggested FSM states:**

```
Idle → Negotiate → WsConnect → Handshake → Connected → (disconnect) → Backoff → …
```

---

## G. `PairDevice` handling

On `type:1`, `target:"PairDevice"`:

- [x] Parse `arguments[0]` object (P4-D2)
- [x] Validate `deviceId` matches local device (case-sensitive per server)
- [x] Persist to NVS:
  - `access_token` (full JWT — P4-D3 buffer)
  - `dom_target`, `sub_target`
  - `token_expires` (P4-D4)
  - `paired` = true
- [x] Prefer single `nvs_store.savePairing(...)` helper
- [x] Serial log: `[HUB] paired dom=… sub=…` (never log full JWT)
- [x] Gracefully close WebSocket
- [x] Re-negotiate and reconnect in **paired** mode (P4-D13)
- [x] Serial log: paired reconnect observed (WS reconnect with `access_token`; no separate `paired reconnect ok` string required)

**Out of scope:** Parsing JWT claims on device (optional debug only); expiry enforcement → Phase 7

---

## H. `nvs_store` pairing helpers

- [x] `savePairing(accessToken, domTarget, subTarget, expiresAtMs)` — all fields + `paired=true`
- [x] `clearPairing()` — already stubbed; verify used on factory reset / future revoke
- [x] Increase token storage limit — separate `kMaxTokenLen` (512+) from `kMaxStringLen` (128) for URLs/SSIDs
- [x] Confirm all NVS keys still ≤ 15 characters

---

## I. Reconnection and Wi-Fi interaction

- [x] Exponential backoff on disconnect / negotiate failure (P4-D8)
- [x] Re-negotiate on each reconnect attempt (P4-D9)
- [x] When Wi-Fi down: pause hub FSM; resume when `wifiManager.isConnected()`
- [x] When Wi-Fi returns: reset backoff or fast-first retry
- [x] Hub activity must not starve `wifi_manager.poll()` or `config_web_server.poll()`

| State | Behavior |
|-------|----------|
| Wi-Fi lost | Disconnect WS; pause hub until STA up |
| WS dropped | Backoff reconnect |
| Paired + valid token | Reconnect with `access_token` |
| Token rejected (type 7) | Log; optional `clearPairing()` + unpaired (full handling Phase 7) |

---

## J. Integration — `main.cpp`

- [x] Pass `&nvsStore`, `&deviceIdentity`, `&wifiManager` into `signalRClient.begin(...)`
- [x] Start hub polling only when:
  - `bootMode == RUNNING`
  - Not Soft-AP
  - `nvsStore.isFullyProvisioned()` (or equivalent)
  - Wi-Fi connected
- [x] Keep init order: NVS → identity → network → config HTTP → hub
- [x] Banner / serial: add hub connection summary after connect
- [x] Add P4-D12 prefix to plan log list in banner if new

---

## K. Config UI updates

- [x] Status page `/`: replace stub with live hub state (unpaired connected / paired connected / connecting / offline)
- [ ] Show `dom_target` / `sub_target` when paired (if stored) — **deferred** (minor; pairing state + hub label sufficient for Phase 4)
- [x] `/api/status` JSON: add `hubConnected`, `hubMode` (`unpaired`|`paired`|`offline`) — optional but recommended
- [x] Do **not** expose JWT or access token in HTML/JSON

---

## L. Verification tests

### L.1 Unpaired connect (no Swagger yet)

- [x] Flash firmware; device on LAN with valid `server_url`
- [x] Serial: negotiate success → WS connect → handshake `{}`
- [x] Connection stable ≥ 30 s (ping/pong if server sends type 6)
- [x] `GET /api/devices/status?subTarget=Slv66` (Dom JWT) → `isConnected: false` before pair (verified during flow)

### L.2 Pair via SomNet UI or Swagger

- [x] Copy **Device ID** from device status page
- [x] Unpaired WS still connected on device
- [x] Pair: SomNet **Options → Hardware device** (primary) or Swagger `POST /api/devices/pair?subTarget=Slv66` with Dom Bearer token
- [x] Response / UI: pairing delivered to device
- [x] Serial: `PairDevice` received → NVS save → paired reconnect
- [x] `GET /api/devices/status?subTarget=Slv66` → `isConnected: true`, `deviceId` matches

### L.3 Persistence across reboot

- [x] Power-cycle ESP32
- [x] Auto-reconnect **paired** without repeat Swagger pair
- [x] Status API still `isConnected: true` after reconnect

### L.4 Coexistence

- [x] While hub connected: `http://<device-ip>/` and `/config` still respond
- [x] Save friendly name on `/config` while hub up — still works (Phase 3 regression)

### L.5 Reconnect resilience (smoke)

- [ ] Restart SomNet API process — device reconnects within backoff window — **deferred** (Phase 7 soak)
- [ ] Brief Wi-Fi glitch — hub resumes — **deferred** (Phase 7 soak)

| Test | Pass? |
|------|-------|
| Unpaired hub connect | ☑ |
| Pair delivered (UI or Swagger) | ☑ |
| Paired reconnect | ☑ |
| Status API isConnected | ☑ |
| Reboot → paired reconnect | ☑ |
| Config UI + hub concurrent | ☑ |
| Build clean | ☑ |

**Sample notes (redact before git):**

```
Device ID: esp32-84CCA85C36B4 (example — redact in shared copies)

API host: 192.168.1.47:5031 (LAN dev — use cloud URL in production docs)

Sub target: Slv66

Pair response: isPaired true, isConnected true (2026-09-05)

Dev notes: Windows Firewall inbound 5031 required for local PC API; not applicable to Azure outbound-only production.
```

---

## M. Documentation updates

- [x] `SomNet.Device/README.md` — Phase 4 behavior, hub connect prerequisites, pairing steps
- [x] Link Phase 4 checklist from README
- [ ] `PROTOCOL.md` — add firmware implementation notes section if framing quirks found (optional — none required)
- [ ] [Hardware User Guide](./Hardware-User-Guide.md) — pairing pointer to SomNet UI Options (Phase 8 polish later)
- [x] No JWTs, real device IDs, or SSIDs in committed checklist notes (sample notes above use redacted/example form)

---

## N. Architecture compliance

- [x] Non-blocking hub FSM in `poll()` — no `delay()` in connect/read path
- [x] `device_id` for unpaired connect from `device_identity` only
- [x] NVS pairing writes through `nvs_store` only
- [x] No `ExecuteCommand` execution or `AckCommand` send (Phase 5)
- [x] Phase 1–3 module boundaries preserved
- [x] NVS keys ≤ 15 characters verified

---

## O. Out of scope — do not implement in Phase 4

| Feature | Phase |
|---------|-------|
| `ExecuteCommand` validation / relay / ack | 5 |
| `AckCommand` hub invocation | 5 |
| Token expiry → unpaired fallback | 7 |
| `wss://` / `WiFiClientSecure` | 7 |
| `GET /api/devices/unpaired` (API) | 8 |
| SomNet React pairing dialog (full UX) | 8 — minimal **Options → Hardware device** shipped as Phase 4 dev bonus; see device plan §4 |
| Operator revoke handling on device | 7 |
| Azure SignalR / multi-instance | Future |

---

## P. Deliverables

- [x] `platformio.ini` — WebSocket + JSON deps, version bump
- [x] `signalr_client.*` — negotiate, WS, handshake, framing, ping, PairDevice, reconnect
- [x] `nvs_store` — `savePairing()`, adequate token buffer
- [x] `main.cpp` — conditional hub start
- [x] Config status UI — live hub state
- [x] README updated
- [x] Parent plan §10 Phase 4 status → **Complete**

---

## Phase 4 exit sign-off

| Criterion | Done |
|-----------|------|
| Device connects unpaired to `/hubs/hardware` with local MAC-based ID | ☑ |
| Pair delivers token; device saves and reconnects paired | ☑ |
| `GET /api/devices/status` shows `isConnected: true` for paired Sub | ☑ |
| Ping/pong handled; connection survives idle ≥ 30 s | ☑ |
| Reboot reconnects paired without manual re-pair | ☑ |
| Config HTTP UI still works while hub connected | ☑ |
| Decisions P4-D1–D16 recorded | ☑ |
| No out-of-scope firmware features merged (§O) | ☑ |
| Ready for Phase 5 (ExecuteCommand + stroke ack) | ☑ |

**Completed by:** hardware verify (UI pair + Swagger status + reboot)  
**Date:** 2026-09-05

---

## Next phase

→ [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 **Phase 5 — Single-pulse command handling and ack**

Future phase checklists:

| Phase | Checklist document | Status |
|-------|-------------------|--------|
| 0–4 | Prior checklists | Complete |
| 5 | [09-ESP32-Phase-5-Checklist.md](./09-ESP32-Phase-5-Checklist.md) | Not started |
| 6+ | *Created when prior phase completes* | — |
