# ESP32 Firmware — Phase 5 Checklist

**Single-pulse command handling and ack** — parse `ExecuteCommand` for `stroke`, validate targeting, route through `command_handler` → `execution_context` → `SinglePulseMode`, invoke `AckCommand`. **Relay GPIO timing remains Phase 6** — Phase 5 may simulate completion or use instant stub pulse.

**Parent plan:** [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §6–7, §9, §10  
**Protocol reference:** [`SomNet.Device/docs/PROTOCOL.md`](../SomNet.Device/docs/PROTOCOL.md) §6–7, §8  
**Prior phase:** [09-ESP32-Phase-4-Checklist.md](./09-ESP32-Phase-4-Checklist.md) (complete)  
**Status:** **Complete** — happy path verified on hardware (2026-09-05); see [Remaining verification](#remaining-verification-optional) for G.2–G.4  
**Target output:** `POST /api/devices/commands` with `commandKey: stroke` → `acknowledged: true`; serial shows `[CMD]` / `[HUB]` ack trace; hub stays connected

---

## Phase 5 at a glance

| Item | Value |
|------|--------|
| **Goal** | End-to-end **stroke** command: `ExecuteCommand` → validate → `SinglePulseMode` → `AckCommand` |
| **Duration** | 2–3 days |
| **Hardware scope** | Same DevKit; **no required relay actuation** (Phase 6) — log/simulate pulse OK for exit |
| **Software scope** | `command_handler`, `execution_context`, `SinglePulseMode`, `signalr_client` ack invoke |
| **Explicitly out of scope** | Real relay FSM (`relay_controller` pulse), burst/automatic modes, UI command wiring, **`resultJson` on API wire** (Phase 8), session/history updates |
| **Blocks** | Phase 6 (relay + button) until command/ack path is proven |

Update **Status** above and check boxes below as work completes. When Phase 5 is done, update the status line in [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 Phase 5.

---

## Prerequisites

### Completed upstream

- [x] Phase 4 complete — [09-ESP32-Phase-4-Checklist.md](./09-ESP32-Phase-4-Checklist.md)
- [x] Device **paired** and hub **connected** (`GET /api/devices/status` → `isConnected: true`)
- [x] Review [PROTOCOL.md](../SomNet.Device/docs/PROTOCOL.md) §6 (`ExecuteCommand`), §7 (`AckCommand`), §8 (Phase 0 decisions H1–H3)
- [x] Review plan §6 *Device-Side Relay and Timing Execution* (architecture — execution stays on device)
- [x] Review plan §7 security checks (deviceId, token, dom/sub)

### Developer environment

- [x] SomNet API running; ESP32 on same LAN (`server_url` = PC LAN IP)
- [x] Swagger **Authorize** with Dom JWT (`demo` / `demo`)
- [x] Paired Sub for testing (e.g. **`Slv66`**)
- [x] Serial monitor 115200 baud
- [x] Windows Firewall inbound **5031** allowed if API on local PC (see Phase 4 notes)

### Module state (post–Phase 5)

| Module | Phase 5 result |
|--------|----------------|
| `signalr_client.cpp` | Forwards `ExecuteCommand`; `sendAckCommand()`; handshake sync fix (implicit `{}` on type-1) |
| `command_handler.*` | Validate + dispatch `stroke`; reject busy/invalid; ack orchestration |
| `execution_context.*` | `startSinglePulse()` + `poll()` delegates to `SinglePulseMode` |
| `single_pulse_mode.*` | Parses `payloadJson`; non-blocking `millis()` timer; `resultJson` + ack callback |
| `relay_controller.*` | Still no GPIO pulse (Phase 6) |

---

## Decisions (set before coding)

| # | Decision | Options | Choice | Date |
|---|----------|---------|--------|------|
| P5-D1 | **Phase 5 stroke completion** | Instant ack (no GPIO) / timed stub without relay / defer to Phase 6 | ☑ **Timed stub** — non-blocking `millis()` for `strokeMs`, log FSM; **no GPIO** until Phase 6 | 2026-09-05 |
| P5-D2 | **Overlapping stroke while busy** | Reject with ack `success: false` / queue | ☑ **Reject** — ack `success: false`, message explains busy (PROTOCOL H2) | 2026-09-05 |
| P5-D3 | **Missing `strokeMs`** | Reject ack / infer from `powerPercent` | ☑ **Reject** — ack `success: false`; do not infer from `powerPercent` (PROTOCOL H3) | 2026-09-05 |
| P5-D4 | **Invalid token / deviceId / dom-sub** | Silent log only / ack `success: false` | ☑ **Ack `success: false`** + short `message` (operator visibility via REST) | 2026-09-05 |
| P5-D5 | **Unsupported `commandKey`** | Ignore / ack `success: false` `"not implemented"` | ☑ **Ack `success: false`**, message `"not implemented"` | 2026-09-05 |
| P5-D6 | **`resultJson` in ack** | Build locally in `message` only / add to Shared DTO now | ☑ **Build `resultJson` string in firmware** (log on serial); **`AckCommand` sends `message` + `success` only** — API DTO field deferred to Phase 8 | 2026-09-05 |
| P5-D7 | **Max `strokeMs` clamp** | 30 000 ms (plan §6) / other | ☑ **30 000 ms** max; reject if above | 2026-09-05 |
| P5-D8 | **Ack `invocationId`** | Monotonic counter per WS session / fixed `"1"` | ☑ **Monotonic uint32** formatted as decimal string per hub session | 2026-09-05 |
| P5-D9 | **Firmware version bump** | e.g. `0.5.0-phase5` | `0.5.0-phase5` | 2026-09-05 |
| P5-D10 | **Pairing test Sub** | e.g. `Slv66` | `Slv66` | 2026-09-05 |

**Rationale (P5-D1):** A software timer exercises `execution_context.poll()` and busy rejection (P5-D2) without waiting for Phase 6 relay wiring. Phase 6 replaces the stub complete callback with `relay_controller.requestPulse(strokeMs)`.

**Rationale (P5-D6):** `HardwareCommandAckDto` has no `resultJson` yet. Firmware builds the JSON string now (same shape as plan §9.4 stroke example) so Phase 8 can pass it through without rework; serial proves content during dev.

### Confirmed (no Phase 5 decision needed)

- Hub event: `type:1`, `target:"ExecuteCommand"`, `arguments[0]` = `HardwareCommandMessageDto` fields (camelCase)
- REST operator path: `POST /api/devices/commands` body `{ subTarget, commandKey, payloadJson }`
- API waits **10 s** for device ack (`HardwareCommandDispatcher.AckTimeout`)
- Device invokes hub method **`AckCommand`** with `{ correlationId, success, message }` (+ optional future `resultJson`)
- `stroke` payload: `{ "powerPercent": int, "strokeMs": int }` — **`strokeMs` required** (P5-D3)
- Phase 5 **`stroke` completion:** software timer only — **no relay GPIO** (P5-D1); Phase 6 adds `relay_controller`
- Overlapping commands while mode active → **reject** (P5-D2)
- Validation failures → **ack with `success: false`** (P5-D4)
- Unsupported keys → ack `"not implemented"` (P5-D5)
- `resultJson` built in firmware, logged serial; **not** on wire until API DTO update (P5-D6)
- Phase 5 implements **`stroke` only**; `burst`, `automatic-start`, `automatic-stop`, `abort` → stub ack
- Command path must remain **non-blocking** (`poll()` only — no `delay()` in handler)
- `[CMD]` serial prefix for command validation and dispatch (plan §12)

---

## A. Wire `ExecuteCommand` from hub to handler

- [x] Remove “ignored (Phase 5)” log-only path in `signalr_client.cpp`
- [x] Parse `arguments[0]` into a small struct or pass JSON substring to `command_handler`
- [x] Do **not** run validation or timing inside `signalr_client` — delegate to `command_handler`
- [x] Hub read loop stays non-blocking

**Expected serial:**

```
[CMD] recv correlationId=... key=stroke
```

---

## B. `command_handler` — validation and dispatch

- [x] `begin(ExecutionContext*, NvsStore*, DeviceIdentity*, SignalRClient* or ack callback)`
- [x] `handleExecuteCommand(...)` or queue + `poll()` drain
- [x] Validate before dispatch:
  - [x] `deviceId` matches `device_identity.deviceId()`
  - [x] `accessToken` matches NVS stored token
  - [x] `domTarget` / `subTarget` match NVS pairing (if stored)
  - [x] Device hub state is **paired** / connected
- [x] On validation failure: log `[CMD] reject: …`; send ack `success: false` with reason (P5-D4)
- [x] If `execution_context.isActive()` and new `stroke`: reject busy (P5-D2)
- [x] Dispatch `stroke` → `execution_context.startSinglePulse(payloadJson, correlationId, …)`
- [x] Dispatch unknown keys → ack `success: false`, message `"not implemented"`

---

## C. `execution_context` + `SinglePulseMode`

- [x] `startSinglePulse(...)` sets active mode to `SinglePulseMode`
- [x] `poll()` calls `activeMode_->poll()` when active
- [x] `abortActive()` forwards to mode (minimal — full abort behavior Phase 6+)
- [x] `SinglePulseMode::start()` parses `payloadJson`:
  - [x] Require `strokeMs` (int, > 0, ≤ max per P5-D7)
  - [x] Optional `powerPercent` for logging / future `resultJson`
- [x] **Phase 5 completion (P5-D1):** non-blocking software timer for `strokeMs` (no GPIO); on timer complete → ack
- [x] On complete: invoke callback → `AckCommand`
- [x] On parse error: ack `success: false`

---

## D. `AckCommand` — device → server

- [x] Build SignalR invocation frame per PROTOCOL §7:
  - `type: 1`, `target: "AckCommand"`, `invocationId`, `arguments: [{ correlationId, success, message }]`
  - Trailing **`0x1E`**
- [x] Send via existing WebSocket client (`sendTXT` or equivalent)
- [x] **Never log full JWT** in ack path
- [x] Prepare **`resultJson` string** locally (P5-D6), log `[CMD] resultJson=...` — do **not** send on wire until Phase 8
- [x] `message` field: human-readable summary (e.g. `"stroke 200ms complete (simulated)"`)

**Expected serial:**

```
[CMD] ack correlationId=... success=true
[HUB] AckCommand sent
```

---

## E. Integration — `main.cpp`

- [x] Wire `commandHandler.begin(...)` with dependencies
- [x] `commandHandler.poll()` in `loop()` after `signalRClient.poll()`
- [x] Order preserved: Wi-Fi → hub → commands → execution → relay stub → button

---

## F. Config UI (optional / minimal)

- [x] No change required for Phase 5 exit
- [ ] Optional: show last command result on status page — **defer** unless trivial

---

## G. Verification tests

### G.1 Happy path — stroke

- [x] Device paired + hub connected
- [x] Swagger **Authorize** (Dom JWT)
- [x] `POST /api/devices/commands`:

```json
{
  "subTarget": "Slv66",
  "commandKey": "stroke",
  "payloadJson": "{\"powerPercent\":50,\"strokeMs\":200}"
}
```

- [x] Response within 10 s:

```json
{
  "delivered": true,
  "acknowledged": true,
  "success": true
}
```

- [x] Serial: `[CMD]` validate → `[STROKE]` or equivalent → ack sent
- [x] Hub remains connected after command

### G.2–G.4 Additional tests

- [x] G.2 validation failures (missing `strokeMs`, bad JSON, unsupported key) — Swagger + serial verified 2026-09-05
- [ ] G.3 busy / overlap — deferred (easier via UI in Phase 8)
- [x] G.4 hub coexistence — 30 s idle OK; config UI OK; reboot + Swagger stroke OK

| Test | Pass? |
|------|-------|
| Stroke command acknowledged | ☑ |
| Swagger REST success true | ☑ |
| Validation rejects bad payload | ☑ |
| Unsupported key stub ack | ☑ |
| Hub stays connected | ☑ |
| Build clean | ☑ |

**Verification notes (2026-09-05, redact tokens before git):**

```
Device ID: esp32-84CCA85C36B4
Sub target: Slv66
Happy path: strokeMs=200 → acknowledged=true success=true; serial [STROKE] complete → [HUB] AckCommand sent
G.2 rejects: missing strokeMs / bad JSON / burst → acknowledged=true success=false; device message on REST
API fix: HardwareCommandDispatcher distinguishes ack received vs command success (no false timeout message)
G.4: 30 s idle stable; config UI loads; reboot + stroke OK
G.3 busy reject: deferred
```

---

## H. Documentation updates

- [x] `SomNet.Device/README.md` — Phase 5 behavior, stroke test via Swagger
- [x] Link Phase 5 checklist from README
- [ ] `PROTOCOL.md` — note Phase 5 firmware behavior if ack/`resultJson` differs from capture (optional; PROTOCOL already documents stroke/ack shape)
- [x] Parent plan §10 Phase 5 status → **Complete** when signed off

---

## I. Architecture compliance

- [x] Non-blocking command path — no `delay()` in handler/mode hot path
- [x] Validation uses NVS + `device_identity` only (no hardcoded Dom/Sub)
- [x] `ExecuteCommand` not executed in `relay_controller` directly — goes through `execution_context`
- [x] Burst/automatic mode classes remain stubs — no scope creep
- [x] Phase 1–4 module boundaries preserved

---

## J. Out of scope — do not implement in Phase 5

| Feature | Phase |
|---------|-------|
| `relay_controller` GPIO pulse FSM | 6 |
| Physical relay ON/OFF timing | 6 |
| `burst` / `automatic-start` / `automatic-stop` execution | 9 |
| Full `abort` during active pulse | 6+ |
| SomNet UI `POST /api/devices/commands` from buttons | 8 |
| `SessionProvider` device-driven history | 8 |
| `HardwareCommandAckDto.resultJson` on API (unless explicitly approved) | 8 |
| Token expiry on command | 7 |

---

## K. Deliverables

- [x] `command_handler.*` — validate, dispatch, ack orchestration
- [x] `execution_context.*` — active mode lifecycle
- [x] `single_pulse_mode.*` — parse stroke payload, complete callback
- [x] `signalr_client.*` — forward `ExecuteCommand`, `sendAckCommand()` helper (+ handshake sync fix)
- [x] `platformio.ini` — version bump (P5-D9)
- [x] README updated
- [x] Parent plan §10 Phase 5 status → **Complete**

---

## Remaining verification

### G.2 Validation failures — verified 2026-09-05

- [x] Missing `strokeMs` → `acknowledged: true`, `success: false`, message `"invalid stroke payload"`
- [x] Malformed `payloadJson` → `acknowledged: true`, `success: false`
- [x] `commandKey: burst` → `acknowledged: true`, `success: false`, `"not implemented"`

**API bonus (2026-09-05):** `HardwareCommandDispatcher` / `DeviceConnectionRegistry` — `acknowledged` vs `success` split so validation rejects no longer show timeout message.

### G.3 Busy / overlap (P5-D2) — deferred

- [ ] Send second `stroke` with long `strokeMs` (e.g. **5000**) before first completes → second ack `success: false`, busy message

### G.4 Hub coexistence — verified 2026-09-05

- [x] After stroke ack, idle ≥ 30 s — ping/pong, no disconnect
- [x] Config UI `http://<device-ip>/` still loads

---

## Phase 5 exit sign-off

| Criterion | Done |
|-----------|------|
| `ExecuteCommand` for `stroke` parsed and validated on device | ☑ |
| `POST /api/devices/commands` returns `acknowledged: true`, `success: true` for valid stroke | ☑ |
| Invalid/unsupported commands ack with `success: false` (not silent hang) | ☑ |
| Serial trace for recv → validate → ack | ☑ |
| Hub stays connected during and after command | ☑ |
| Decisions P5-D1–D10 recorded | ☑ |
| No out-of-scope features merged (§J) | ☑ |
| Ready for Phase 6 (relay GPIO + real pulse timing) | ☑ |

**Completed by:** hardware verification (stroke E2E)  
**Date:** 2026-09-05

---

## Next phase

→ [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 **Phase 6 — Single-pulse relay and button**

Future phase checklists:

| Phase | Checklist document | Status |
|-------|-------------------|--------|
| 0–4 | Prior checklists | Complete |
| 5 | This document | **Complete** (G.3 busy deferred) |
| 6 | *TBD: `09-ESP32-Phase-6-Checklist.md`* | — |
| 7+ | *Created when prior phase completes* | — |
