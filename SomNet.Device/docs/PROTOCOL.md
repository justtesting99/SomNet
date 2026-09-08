# SomNet Hardware Hub — Wire Protocol

Captured and verified in **Phase 0** (2026-09-05) against SomNet API `http://localhost:5031`.

**Audience:** ESP32 firmware (`SomNet.Device`) implementing a minimal SignalR JSON client.  
**Scope:** Commands `stroke`, `burst`, `abort`, `automatic-start`, and `automatic-stop` (Phases 5–9 Part 2).

**Source references:**

| File | Purpose |
|------|---------|
| `SomNet.Shared/DTO/Devices/DeviceDtos.cs` | Message DTO shapes |
| `SomNet.Shared/Models/DeviceConstants.cs` | Hub method names, JWT claim types |
| `SomNet.API/Hubs/HardwareHub.cs` | Connection rules |
| `SomNet.API/Services/HardwareCommandDispatcher.cs` | Per-command ack timeout (P9-D1) |

**Capture tooling:** `SomNet.Device/tools/phase0-capture.mjs` (re-runnable against local API).

---

## 1. Transport overview

| Item | Value |
|------|--------|
| Hub path | `/hubs/hardware` |
| Protocol | SignalR **JSON** hub protocol over WebSocket |
| Record separator | **`0x1E`** (ASCII RS) after every JSON frame |
| Negotiate | `POST /hubs/hardware/negotiate?negotiateVersion=1` → `connectionToken` |
| Dev base URL | `http://localhost:5031` |
| Device LAN URL | `ws://{server-host}:5031/hubs/hardware?...` (use PC LAN IP, not `localhost`) |

### Connection modes

| Mode | WebSocket query params | Auth |
|------|------------------------|------|
| **Unpaired device** | `id={connectionToken}&deviceId=esp32-{MAC}` | None |
| **Paired device** | `id={connectionToken}&access_token={deviceJwt}` | Device JWT |
| **Invalid** | Neither device JWT nor `deviceId` | Server sends `{}` then `{"type":7}` and closes |

Negotiate is required before WebSocket connect. The `id` query parameter is the `connectionToken` from negotiate, not the device id.

---

## 2. Handshake (all connections)

After WebSocket open, client sends:

```json
{"protocol":"json","version":1}
```

Followed by **`0x1E`**.

Server responds with an empty object (success):

```json
{}
```

Followed by **`0x1E`**.

**Observed (unpaired):** connection stays open; device joins group `unpaired:{deviceId}`.

**Observed (invalid):** `{}` then `{"type":7}` (Close); WebSocket closes.

---

## 3. SignalR message types (firmware subset)

| type | Name | Direction | Use |
|------|------|-----------|-----|
| 1 | Invocation | Both | Hub events (`PairDevice`, `ExecuteCommand`) and hub method (`AckCommand`) |
| 6 | Ping | Server → client; client replies | Keepalive |
| 7 | Close | Server → client | Connection rejected |

### Ping / pong

Server may send:

```json
{"type":6}
```

Client must reply with the same frame (type 6) plus **`0x1E`**. Observed within ~15 s on idle paired connection during Phase 0 capture.

---

## 4. Unpaired device flow

### 4.1 Connect

```
POST http://{host}:5031/hubs/hardware/negotiate?negotiateVersion=1
Body: {}

→ { "connectionToken": "...", "connectionId": "...", ... }

WS ws://{host}:5031/hubs/hardware?id={connectionToken}&deviceId=esp32-A4C1389F2B01
→ handshake (§2)
```

**Device ID format:** `esp32-{12 hex MAC digits}` uppercase, no colons (e.g. `esp32-A4C1389F2B01`).

### 4.2 PairDevice event (server → device)

After an authenticated Dom calls `POST /api/devices/pair`, the server pushes:

```json
{
  "type": 1,
  "target": "PairDevice",
  "arguments": [
    {
      "deviceId": "esp32-A4C1389F2B01",
      "domTarget": "demo",
      "subTarget": "Slv66",
      "accessToken": "<device-jwt>",
      "expiresAt": "2027-09-05T02:38:57.6124499+00:00"
    }
  ]
}
```

Plus **`0x1E`**.

Field names match `PairDeviceMessageDto` (camelCase). Firmware must:

1. Verify `deviceId` matches local identity.
2. Persist `accessToken` and `expiresAt` to NVS.
3. Disconnect and reconnect in **paired** mode (§5).

### 4.3 Pair REST API (operator — not on ESP32)

Dom-authenticated request (Swagger / SomNet UI):

```http
POST /api/devices/pair?subTarget=Slv66
Authorization: Bearer {operator-jwt}
Content-Type: application/json

{ "deviceId": "esp32-A4C1389F2B01" }
```

Example response (tokens redacted in docs):

```json
{
  "deviceId": "esp32-A4C1389F2B01",
  "domTarget": "demo",
  "subTarget": "Slv66",
  "accessToken": "<device-jwt>",
  "expiresAt": "2027-09-05T02:38:57.6124499+00:00",
  "deliveredToDevice": true,
  "message": "Pairing token delivered to the connected device."
}
```

---

## 5. Paired device flow

### 5.1 Connect

```
POST /hubs/hardware/negotiate?negotiateVersion=1

WS ws://{host}:5031/hubs/hardware?id={connectionToken}&access_token={deviceJwt}
→ handshake (§2)
```

JWT is passed as query param `access_token` (ASP.NET Core SignalR convention).

**Verify pairing:** `GET /api/devices/status?subTarget=Slv66` (operator JWT) → `isConnected: true`, `deviceId` set.

### 5.2 Device JWT claims

Issued with audience `SomNet.Device`. Decoded payload shape:

| Claim | Example | Notes |
|-------|---------|-------|
| `sub` | `esp32-A4C1389F2B01` | Device id (JWT subject) |
| `role` | `device` | Must be `device` |
| `device_id` | `esp32-A4C1389F2B01` | Same as `sub` |
| `dom` | `demo` | Dom target |
| `sub_target` | `Slv66` | Sub name — **not** `sub` (reserved for JWT subject) |
| `jti` | `{guid}` | Token id |
| `iss` | `SomNet` | |
| `aud` | `SomNet.Device` | |
| `exp` / `nbf` | | Default ~365 days (`DeviceExpireDays`) |

**Practical JWT length:** ~350–450 characters (HS256).

**Phase 0 fix:** `DeviceClaimTypes.SubTarget` is `sub_target` to avoid colliding with standard JWT `sub`. Firmware validating tokens only needs `device_id`, `dom`, and `sub_target` (or REST-provided values from `PairDevice`).

---

## 6. ExecuteCommand (server → device)

Triggered by operator REST:

```http
POST /api/devices/commands
Authorization: Bearer {operator-jwt}
Content-Type: application/json

{
  "subTarget": "Slv66",
  "commandKey": "stroke",
  "payloadJson": "{\"powerPercent\":50,\"strokeMs\":200}"
}
```

### 6.1 WebSocket message

```json
{
  "type": 1,
  "target": "ExecuteCommand",
  "arguments": [
    {
      "correlationId": "2b19f3a0df024239af1669e1bd6669e6",
      "commandKey": "stroke",
      "accessToken": "<device-jwt>",
      "domTarget": "demo",
      "subTarget": "Slv66",
      "deviceId": "esp32-A4C1389F2B01",
      "payloadJson": "{\"powerPercent\":50,\"strokeMs\":200}"
    }
  ]
}
```

Plus **`0x1E`**.

### 6.2 Firmware validation before acting

1. `deviceId` matches local device.
2. `accessToken` matches NVS-stored token (string compare).
3. `commandKey` is supported (`stroke`, `burst`, `abort`, `automatic-start`, `automatic-stop`).
4. Parse `payloadJson` — see §6.3–§6.5.

### 6.3 stroke payload (initial scope)

```json
{
  "powerPercent": 50,
  "strokeMs": 200
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `powerPercent` | int | Recommended | 0–100; firmware may map to PWM later |
| `strokeMs` | int | **Yes** | Relay active duration; reject command if missing |

### 6.4 burst payload (Phase 9)

```json
{
  "powerPercent": 50,
  "strokeMs": 200,
  "burstStrokes": 5,
  "burstDelayMs": 5000
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `strokeMs` | int | **Yes** | Duration of each relay close |
| `burstStrokes` | int | **Yes** | 1–100 |
| `burstDelayMs` | int | **Yes** | Idle time between pulses (0–300000) |
| `powerPercent` | int | Recommended | 0–100 |

Device runs the full sequence locally; one completing ack with `resultJson` when done or aborted.

### 6.5 automatic-start payload (Phase 9 Part 2)

```json
{
  "automaticMode": "periodic",
  "minimumStrokeMs": 25,
  "maximumStrokeMs": 400,
  "minimumPower": 0,
  "maximumPower": 80,
  "strokeMinSeconds": 5,
  "strokeMaxSeconds": 5,
  "delayBeforeStartSeconds": 0,
  "endSessionMode": "strokes",
  "endSessionValue": 8,
  "burstsOn": false
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `automaticMode` | string | **Yes** | One of: `periodic`, `randomPowerOnly`, `randomTimingOnly`, `randomPowerAndTiming`, `powerWave`, `powerAndTimingWave`, `buildUp` |
| `minimumStrokeMs` / `maximumStrokeMs` | int | Recommended | Device defaults 25/400; API validates against max stroke ms |
| `minimumPower` / `maximumPower` | int | Recommended | 0–100 |
| `strokeMinSeconds` / `strokeMaxSeconds` | int | Recommended | Gap range (seconds) |
| `delayBeforeStartSeconds` | int | Optional | Wait before first pulse |
| `endSessionMode` | string | Optional | `minutes`, `strokes`, or `noAutoEnd` — wave/build-up require minutes or strokes |
| `endSessionValue` | int | Optional | End after N minutes or strokes |
| `burstsOn` | bool | Optional | Default **`false`**. When **`true`**, burst sub-fields validated (§6.7); burst sub-FSM runs (Phase 10B+) |

**UI rule:** Send full automatic settings snapshot; **omit `running`**. Device applies mode-specific ignore rules for disabled minimum fields.

**Ack:** **Immediate** `success: true` when config valid and engine armed (P9-D2). No `resultJson` on start.

**Unsolicited session complete:** When the session ends via **end-session rule** or **abort** (without `automatic-stop`), the device sends `AckCommand` with `correlationId` **`automatic-session-complete`** and stop `resultJson`. The API forwards this to operators via `CommandAcknowledged`; the UI uses it to clear `running` and finalize session history.

### 6.6 automatic-stop payload

```json
{}
```

Optional `{ "reason": "operator" }` — device reports measured `endReason` in stop `resultJson`.

**Ack:** Completing ack after session stops at safe point (gap or post-pulse). REST timeout **30 s** (P9-D1).

### 6.7 automatic-start burst fields (Phase 10)

When **`burstsOn: true`**, the start payload includes burst settings (full snapshot, camelCase). Device validates config and runs burst sub-FSM interleaved with the selected automatic program (Phase 10B+).

| Field | Type | Notes |
|-------|------|-------|
| `burstsOn` | bool | Master enable |
| `burstPercent` | int | 0–100 — burst **event count** spread evenly across session envelope |
| `burstStyle` | string | `fixedPowerDelay`, `randomPowerOnly`, `randomDelayOnly`, `randomPowerAndDelay` |
| `burstStrokePowerMin` / `burstStrokePowerMax` | int | 0–100 **relative to** `minimumPower`–`maximumPower` (session envelope) |
| `burstDelayMin` / `burstDelayMax` | int | Seconds between strokes **inside** a burst |
| `burstStrokesMin` / `burstStrokesMax` | int | Strokes per burst event (1–100 each; min ≤ max when `burstsOn: true`) |

**Validation (P10-D9):** When `burstsOn: true`, firmware and API **reject** out-of-range values — same caps as manual burst (`burstStrokes` 1–100, delay 0–300 s). See Phase 10 checklist §4.1.

**Power mapping:** `effectivePower = lerp(minimumPower, maximumPower, burstRelative / 100)` → `strokeMsFromPower(..., minimumStrokeMs, maximumStrokeMs)`. Intra-burst power/delay use Burst Settings only — not the active program row. After each burst, program `gapSec` applies before the next main stroke.

Detail: [Phase 10 checklist](../../Documents/09-ESP32-Phase-10-Checklist.md).

---

## 7. AckCommand (device → server)

After executing (or rejecting) a command, invoke hub method `AckCommand`:

```json
{
  "type": 1,
  "invocationId": "1",
  "target": "AckCommand",
  "arguments": [
    {
      "correlationId": "2b19f3a0df024239af1669e1bd6669e6",
      "success": true,
      "message": "stroke complete"
    }
  ]
}
```

Plus **`0x1E`**.

Matches `HardwareCommandAckDto`: `correlationId`, `success`, `message`, optional **`resultJson`** (string containing JSON).

When present, `resultJson` is a **string containing JSON** (not a nested object).

**Stroke** inner shape:

```json
{
  "commandKey": "stroke",
  "deviceId": "esp32-A4C1389F2B01",
  "strokeMs": 200,
  "powerPercent": 50,
  "actualStrokeMs": 205,
  "success": true
}
```

**Burst** completion (excerpt):

```json
{
  "commandKey": "burst",
  "requestedStrokes": 5,
  "strokesCompleted": 5,
  "interrupted": false
}
```

**Automatic stop** — session summary (authoritative for UI history):

```json
{
  "commandKey": "automatic-stop",
  "automaticMode": "periodic",
  "powerPercent": 80,
  "strokeMs": 325,
  "gapSec": 5,
  "strokesCompleted": 3,
  "durationMs": 12599,
  "endSessionMode": 2,
  "endSessionValue": 8,
  "interrupted": false,
  "endReason": "manualStop"
}
```

| Field | Notes |
|-------|-------|
| `endSessionMode` | Wire int: `0` = noAutoEnd, `1` = minutes, `2` = strokes |
| `endReason` | `manualStop`, `endSession`, `abort`, or `error` |
| `durationMs` | Elapsed since first pulse (after start delay) |
| `strokesCompleted` | Part 2: main program strokes. Phase 10 with bursts: **alias of `mainStrokesCompleted`** |

**Phase 10 (when `burstsOn: true`)** — additional fields on stop/complete (tier 1 implemented; tier 3 `burstDetails[]` optional):

```json
{
  "commandKey": "automatic-stop",
  "automaticMode": "periodic",
  "burstsOn": true,
  "mainStrokesCompleted": 80,
  "burstEventsCompleted": 8,
  "strokesCompleted": 80,
  "intraBurstStrokesCompleted": 52,
  "burstPercent": 10,
  "burstStyle": "randomPowerOnly",
  "durationMs": 1500000,
  "endSessionMode": 1,
  "endSessionValue": 30,
  "interrupted": false,
  "endReason": "manualStop"
}
```

Optional `burstDetails[]` (max 16 entries) per Phase 10 checklist §3.3.1.

### REST result (operator)

If ack arrives within the per-command timeout:

```json
{
  "correlationId": "2b19f3a0df024239af1669e1bd6669e6",
  "delivered": true,
  "acknowledged": true,
  "success": true,
  "message": "Device acknowledged the command.",
  "resultJson": "{\"commandKey\":\"stroke\",\"actualStrokeMs\":205,...}"
}
```

---

## 8. Phase 0 decisions (firmware defaults)

| # | Question | Decision |
|---|----------|----------|
| H1 | Relay active level | **TBD** — bench test on DevKit (document in `boardDefs.h`) |
| H2 | Overlapping `stroke` while pulse active | **Reject** — ack `success: false`, message explains busy |
| H3 | Missing `strokeMs` in payload | **Reject** — do not infer from `powerPercent` |

---

## 9. Error and edge cases

| Condition | Observed behavior |
|-----------|-------------------|
| No `deviceId`, no JWT | Handshake `{}`, then `{"type":7}`, connection closed |
| Invalid/expired device JWT | Same as invalid connect |
| Device not connected when command sent | REST `delivered: false`, message *"The paired device is not connected."* |
| No pairing registration | REST `delivered: false`, message *"No paired device token exists..."* |
| Ack not received in time | REST `delivered: true`, `acknowledged: false` — timeout per command (stroke/abort **15 s**; burst formula; `automatic-start` **5 s**; `automatic-stop` **30 s**) |

---

## 10. Cross-reference verification (Phase 0)

| Field / constant | Expected (source) | Observed (capture) | Match |
|------------------|-------------------|--------------------|-------|
| Hub path | `/hubs/hardware` | `/hubs/hardware` | Yes |
| Event `PairDevice` | `HardwareHubMethods.PairDevice` | `target: "PairDevice"` | Yes |
| Event `ExecuteCommand` | `HardwareHubMethods.ExecuteCommand` | `target: "ExecuteCommand"` | Yes |
| Method `AckCommand` | `HardwareHubMethods.AckCommand` | `target: "AckCommand"` | Yes |
| Query `deviceId` (unpaired) | `HardwareHub.OnConnectedAsync` | Present in WS URL | Yes |
| Query `access_token` (paired) | `Program.cs` JwtBearerEvents | Present in WS URL | Yes |
| Framing | SignalR JSON spec | `0x1E` after each frame | Yes |
| Ack timeout | 10 s | Ack within 10 s → `acknowledged: true` | Yes |

---

## 11. Minimal firmware sequence (checklist)

1. **Boot** — read MAC → `deviceId`; load token from NVS if present.
2. **Negotiate** — POST `/hubs/hardware/negotiate?negotiateVersion=1`.
3. **Connect** — unpaired (`?deviceId=`) or paired (`?access_token=`).
4. **Handshake** — send protocol frame; wait for `{}`.
5. **Loop** — parse frames split on `0x1E`:
   - `type: 6` → reply ping
   - `type: 1`, `target: PairDevice` → save token, reconnect paired
   - `type: 1`, `target: ExecuteCommand` → validate, run FSM, `AckCommand`
6. **Reconnect** — on disconnect, exponential backoff; re-negotiate each attempt.

---

## Revision history

| Date | Change |
|------|--------|
| 2026-09-05 | Phase 0 capture complete; `sub_target` JWT claim documented |
| 2026-09-07 | Phase 9 Part 2 — `automatic-start`/`automatic-stop` payload + stop `resultJson`; burst payload; per-command ack timeouts |
| 2026-09-07 | Phase 10B+ — burst sub-FSM; extended automatic stop `resultJson` (tier 1 verified UI E2E) |
| 2026-09-07 | Phase 10A — `burstsOn` accept + burst field validation (firmware + API) |
| 2026-09-07 | Phase 10 planned — §6.7 burst fields on `automatic-start`; extended automatic stop `resultJson` shape; §4.1 validation caps |
