# ESP32 Firmware — Phase 0 Checklist

Protocol verification before PlatformIO scaffold and firmware coding.

**Parent plan:** [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10  
**Status:** Not started  
**Target output:** `SomNet.Device/docs/PROTOCOL.md` (created when `SomNet.Device/` exists; interim notes may live in this checklist)

---

## Phase 0 at a glance

| Item | Value |
|------|--------|
| **Goal** | Capture and document real SignalR/WebSocket traffic for `/hubs/hardware` |
| **Duration** | 1–2 days |
| **Initial command scope** | `stroke` only (single pulse) |
| **Blocks** | Phase 1 scaffold until exit criteria met |

Update **Status** above and check boxes below as work completes. When Phase 0 is done, update the status line in [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 Phase 0.

---

## Prerequisites

### Environment

- [ ] SomNet API runs locally (`dotnet run` from `SomNet.API`, `http` profile)
- [ ] Swagger available at `http://localhost:5031/swagger`
- [ ] Demo Dom account works (`demo` / `demo`)
- [ ] Target Sub exists (e.g. `Slv66`)

### Decisions (set before capture)

| # | Decision | Choice | Date |
|---|----------|--------|------|
| D1 | **Device ID format** for tests | ☑ **`esp32-{MAC}`** (confirmed §4.1)  ☐ Other: ________ | |
| D2 | **Test device ID** used in captures | `esp32-________________` (from board MAC or placeholder) | |
| D3 | **WebSocket URL (dev)** | `ws://__________:5031/hubs/hardware` (PC LAN IP, not `localhost` for device) | |
| D4 | **WebSocket URL (same-PC test)** | `ws://localhost:5031/hubs/hardware` (browser capture only) | |
| D5 | **Capture tool** | ☐ Browser DevTools  ☐ wscat  ☐ Other: ________ | |

### Already confirmed (no Phase 0 decision needed)

- Repo folder: `SomNet.Device/` under SomNet (not in `.slnx`)
- PlatformIO + Cursor; board `esp32dev` (DevKit V1 clone)
- Initial firmware scope: **`stroke` only**
- Device ID: **`esp32-{MAC}`** (read-only on config UI — plan §4.1)
- Config web UI **Phase 3** for Wi-Fi, server URL, friendly name, pairing ID display
- DTO reference: `SomNet.Shared/DTO/Devices/DeviceDtos.cs`
- Hub constants: `SomNet.Shared/Models/DeviceConstants.cs`

---

## A. Unpaired device connection

Connect a WebSocket client with **no JWT**, only `deviceId` query param.

- [ ] Connect to `{base}/hubs/hardware?deviceId={D2}`
- [ ] Connection stays open (not aborted)
- [ ] Save **handshake request** (client → server)
- [ ] Save **handshake response** (server → client)
- [ ] Confirm record separator **`0x1E`** framing on all messages after handshake

**Capture notes / paste zone:**

```
Handshake send:


Handshake receive:


```

---

## B. PairDevice event (server → client)

With unpaired connection open:

- [ ] Login via Swagger or UI; obtain operator JWT if needed for pair API
- [ ] `POST /api/devices/pair?subTarget=Slv66` with body `{ "deviceId": "<D2>" }`
- [ ] Capture **`PairDevice`** message received on WebSocket
- [ ] Document full JSON envelope (SignalR `type`, `target`, `arguments[]`)
- [ ] Confirm payload fields: `deviceId`, `domTarget`, `subTarget`, `accessToken`, `expiresAt`
- [ ] Field names match camelCase in `PairDeviceMessageDto`

**Capture notes:**

```
PairDevice raw message:


Parsed arguments[0]:


```

---

## C. Paired device connection

- [ ] Disconnect unpaired session
- [ ] Reconnect to `{base}/hubs/hardware?access_token={deviceJwt}`
- [ ] Handshake succeeds
- [ ] Connection registered (verify `GET /api/devices/status?subTarget=Slv66` → `isConnected: true`)

**Notes:**

```
Paired connect URL pattern (redact token in saved doc):


Connection errors (if any):


```

---

## D. ExecuteCommand event (server → client)

Send a **stroke** command via API while device/test client is connected paired.

- [ ] `POST /api/devices/commands` with body:

```json
{
  "subTarget": "Slv66",
  "commandKey": "stroke",
  "payloadJson": "{\"powerPercent\":50,\"strokeMs\":200}"
}
```

- [ ] Capture **`ExecuteCommand`** WebSocket message
- [ ] Document full JSON envelope
- [ ] Confirm payload fields: `correlationId`, `commandKey`, `accessToken`, `domTarget`, `subTarget`, `deviceId`, `payloadJson`
- [ ] Field names match `HardwareCommandMessageDto`

**Capture notes:**

```
ExecuteCommand raw message:


payloadJson inner content:


REST response from POST /api/devices/commands:


```

---

## E. AckCommand (client → server)

Simulate device ack from test client (before ESP32 firmware exists).

- [ ] Send **`AckCommand`** with matching `correlationId` from §D
- [ ] Server accepts invocation (no protocol error)
- [ ] REST command response shows `acknowledged: true` (if sent in time)
- [ ] Document exact **client → server** JSON envelope for `AckCommand`
- [ ] Document `HardwareCommandAckDto` shape: `correlationId`, `success`, `message`
- [ ] Note whether `resultJson` is accepted today or **proposed** (API may not have field yet)

**Capture notes:**

```
AckCommand send:


Server response / follow-up messages:


```

---

## F. Keepalive and disconnect

- [ ] Capture **ping** message from server (SignalR type 6)
- [ ] Document required **pong** reply
- [ ] Capture connection **close** frame or abort when token invalid / missing `deviceId`
- [ ] Document behavior for expired or wrong token

**Capture notes:**

```
Ping message:


Pong reply:


Close/error example:


```

---

## G. Cross-reference verification

Compare captures against source files:

- [ ] `SomNet.Shared/DTO/Devices/DeviceDtos.cs`
- [ ] `SomNet.Shared/Models/DeviceConstants.cs` (hub method names)
- [ ] `SomNet.API/Hubs/HardwareHub.cs` (connection rules)
- [ ] `SomNet.API/Services/HardwareCommandDispatcher.cs` (ack timeout: 10 s)

| Field / constant | Expected (source) | Observed (capture) | Match? |
|------------------|-------------------|--------------------|--------|
| Hub path | `/hubs/hardware` | | ☐ |
| Event `PairDevice` | | | ☐ |
| Event `ExecuteCommand` | | | ☐ |
| Method `AckCommand` | | | ☐ |
| Query `deviceId` (unpaired) | | | ☐ |
| Query `access_token` (paired) | | | ☐ |
| JWT practical length | ≤ ______ chars | ______ | ☐ |

---

## H. Decisions to record before Phase 1

Resolve during or immediately after Phase 0 (update [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §15 when decided):

| # | Question | Decision | Date |
|---|----------|----------|------|
| H1 | Relay active level (`RELAY_ACTIVE_HIGH`) | ☐ Active-high  ☐ Active-low  ☐ TBD (bench test) | |
| H2 | Overlapping `stroke` while pulse active | ☐ Reject  ☐ Queue | |
| H3 | Missing `strokeMs` in payload | ☐ Reject (recommended)  ☐ Compute from powerPercent | |

---

## I. Deliverables

- [ ] **`PROTOCOL.md`** written under `SomNet.Device/docs/` (or interim appendix in this file until folder exists)
- [ ] Includes: handshake, PairDevice, ExecuteCommand, AckCommand, ping/pong, error cases
- [ ] Includes: example **stroke** payload and target **ack `resultJson`** (even if API field pending)
- [ ] Redacted samples (no live JWTs in git)
- [ ] Link from [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 Phase 0 marked **Complete**
- [ ] Optional: short update to [06-SignalR-And-Hardware.md](./06-SignalR-And-Hardware.md) if capture contradicts doc

---

## Phase 0 exit sign-off

| Criterion | Done |
|-----------|------|
| All sections A–G complete | ☐ |
| `PROTOCOL.md` (or equivalent) exists | ☐ |
| Decisions D1–D5 recorded | ☐ |
| Parent plan §10 Phase 0 status updated | ☐ |
| Ready for Phase 1 scaffold | ☐ |

**Completed by:** _______________  
**Date:** _______________

---

## Next phase

→ [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 **Phase 1 — Project scaffold**

Future phase checklists (to be added as phases start):

| Phase | Checklist document | Status |
|-------|-------------------|--------|
| 0 | This document | Not started |
| 1 | *TBD: `09-ESP32-Phase-1-Checklist.md`* | — |
| 2+ | *Created when prior phase completes* | — |
