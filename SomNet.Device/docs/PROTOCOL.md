# SomNet Hardware Hub — Wire Protocol

Captured and verified in **Phase 0** (2026-09-05) against SomNet API `http://localhost:5031`.

**Audience:** ESP32 firmware (`SomNet.Device`) implementing a minimal SignalR JSON client.  
**Scope:** Initial command `stroke` only; burst/automatic documented for future phases.

**Source references:**

| File | Purpose |
|------|---------|
| `SomNet.Shared/DTO/Devices/DeviceDtos.cs` | Message DTO shapes |
| `SomNet.Shared/Models/DeviceConstants.cs` | Hub method names, JWT claim types |
| `SomNet.API/Hubs/HardwareHub.cs` | Connection rules |
| `SomNet.API/Services/HardwareCommandDispatcher.cs` | Ack timeout (10 s) |

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
3. `commandKey` is supported (`stroke` in Phase 1).
4. Parse `payloadJson` — for `stroke`, require `strokeMs` (see §8).

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

Matches `HardwareCommandAckDto`: `correlationId`, `success`, `message`.

### REST result (operator)

If ack arrives within **10 seconds**:

```json
{
  "correlationId": "2b19f3a0df024239af1669e1bd6669e6",
  "delivered": true,
  "acknowledged": true,
  "success": true,
  "message": "Device acknowledged the command."
}
```

### Proposed `resultJson` (not in API yet)

Firmware should **prepare** a JSON result string for future API/UI use; send via `message` today or hold locally until `HardwareCommandAckDto` gains `resultJson`:

```json
{
  "commandKey": "stroke",
  "deviceId": "esp32-A4C1389F2B01",
  "startedAt": "2026-09-05T02:38:58.000Z",
  "completedAt": "2026-09-05T02:38:58.200Z",
  "strokeMs": 200,
  "powerPercent": 50,
  "success": true
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
| Ack not received in 10 s | REST `delivered: true`, `acknowledged: false` |

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
