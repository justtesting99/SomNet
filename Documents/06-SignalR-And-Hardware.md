# SignalR & Hardware Integration

SomNet provides real-time communication between the API and ESP32 hardware devices through a SignalR hub.

| Layer | Status (2026-09-05) |
|-------|------------------------|
| **API + hub** | Complete — pairing, dispatch, ack registry |
| **ESP32 firmware** | **Phases 0–6 signed off** — `stroke` + `abort` on hardware; firmware **`0.6.0-phase6`** |
| **React UI** | **Partial** — minimal pairing in Options; stroke/burst buttons still use simulated ack |

**Related docs:** [ESP32 Device Plan](./09-ESP32-Device-Plan.md) (source of truth) · [PROTOCOL.md](../SomNet.Device/docs/PROTOCOL.md) (wire capture) · [Hardware User Guide](./Hardware-User-Guide.md) · [SomNet.Device/README](../SomNet.Device/README.md)

---

## Hub Endpoint

```
/hubs/hardware
```

**Implementation:** `SomNet.API/Hubs/HardwareHub.cs`

Registered in `Program.cs`:

```csharp
app.MapHub<HardwareHub>("/hubs/hardware");
```

SignalR JSON protocol uses the same `SomNetJsonOptions` camelCase serialization as the REST API. Every JSON frame is terminated with **`0x1E`** (record separator) — see [PROTOCOL.md](../SomNet.Device/docs/PROTOCOL.md).

---

## Connection Types

When a client connects, `OnConnectedAsync` classifies the connection:

| Connection | How identified | Group joined | Capabilities |
|------------|----------------|--------------|--------------|
| **Paired device** | JWT with `role=device` | `paired:{dom}:{sub}` | Receive commands, send acks |
| **Operator** | JWT with operator audience | `operator:{dom}` | Receive `CommandAcknowledged` (future live UI) |
| **Unpaired device** | Query `?deviceId=...` (no auth) | `unpaired:{deviceId}` | Receive pairing token only |
| **Invalid** | None of the above | — | Connection aborted |

**Device ID format:** `esp32-{12HEX}` from MAC (e.g. `esp32-84CCA85C36B4`). Set in firmware via `device_identity`; shown read-only on the on-device config UI.

On disconnect, `DeviceConnectionRegistry` removes the connection and updates status.

---

## Hub Methods and Events

Constants in `SomNet.Shared/Models/DeviceConstants.cs`:

### Server → Client

| Event | Payload | Recipient | Purpose |
|-------|---------|-----------|---------|
| `PairDevice` | `PairDeviceMessageDto` | Unpaired or paired device group | Deliver JWT after pairing |
| `ExecuteCommand` | `HardwareCommandMessageDto` | `paired:{dom}:{sub}` | Send stroke/burst/etc. to device |
| `CommandAcknowledged` | `HardwareCommandAckDto` | `operator:{dom}` | Forward device ack to operator UI |

### Client → Server

| Method | Payload | Sender | Purpose |
|--------|---------|--------|---------|
| `AckCommand` | `HardwareCommandAckDto` | Paired device | Confirm command execution |

**DTO note:** `HardwareCommandAckDto` includes `correlationId`, `success`, `message`, and optional **`resultJson`** (string containing JSON). REST `POST /api/devices/commands` forwards `resultJson` to the UI; `CommandAcknowledged` hub events include it for future multi-tab use.

---

## Pairing Flow

```
┌──────────┐                    ┌──────────┐                    ┌──────────┐
│  ESP32   │                    │   API    │                    │ Dom (UI) │
└────┬─────┘                    └────┬─────┘                    └────┬─────┘
     │  Negotiate + WS             │                               │
     │  ?deviceId=esp32-...        │                               │
     │──────────────────────────────►│                               │
     │  Join unpaired:{deviceId}   │                               │
     │                               │  POST /api/devices/pair       │
     │                               │◄──────────────────────────────│
     │                               │  Create device JWT            │
     │                               │  Save SubDeviceRegistration   │
     │  PairDevice { token, ... }    │                               │
     │◄──────────────────────────────│                               │
     │  Store token in NVS           │                               │
     │  Disconnect                   │                               │
     │  Reconnect ?access_token=JWT  │                               │
     │──────────────────────────────►│                               │
     │  Join paired:Dom:Slv66        │                               │
     │                               │                               │
```

### Pair API Details

**Request:** `POST /api/devices/pair?subTarget=Slv66`

```json
{ "deviceId": "esp32-84CCA85C36B4" }
```

**Server actions:**
1. Validate Dom owns subTarget
2. Generate device JWT via `DeviceTokenService`
3. Upsert `SubDeviceRegistration` (deviceId, token, jti, expiry)
4. Send `PairDevice` to `unpaired:{deviceId}` and `paired:{dom}:{sub}` groups
5. Return pairing metadata to caller

**Revoke:** `DELETE /api/devices/pair?subTarget=Slv66` — sets `IsRevoked`, clears active connection.

**Dev UI path:** SomNet **Options → Hardware device** (`DevicePairingPanel`) — paste device ID from ESP32 status page. **Production UX** (dedicated dialog, pending list) → Phase 8.

---

## Command Dispatch Flow

```
┌──────────┐                    ┌──────────┐                    ┌──────────┐
│ Dom (UI) │                    │   API    │                    │  ESP32   │
└────┬─────┘                    └────┬─────┘                    └────┬─────┘
     │  POST /api/devices/commands   │                               │
     │  { subTarget, commandKey,       │                               │
     │    payloadJson }                │                               │
     │──────────────────────────────►│                               │
     │                               │  Verify registration + conn   │
     │                               │  ExecuteCommand               │
     │                               │──────────────────────────────►│
     │                               │                               │ Validate + FSM
     │                               │  AckCommand(correlationId)    │
     │                               │◄──────────────────────────────│
     │                               │  CommandAcknowledged → operator group
     │  { delivered, acknowledged,   │                               │
     │    success, message }         │                               │
     │◄──────────────────────────────│                               │
```

**Verified path (2026-09-05):** Swagger `POST /api/devices/commands` with `commandKey: stroke` on paired hardware (`esp32-84CCA85C36B4` / Sub `Slv66`). React UI buttons do **not** call this endpoint yet.

### Command Request

**POST /api/devices/commands**

```json
{
  "subTarget": "Slv66",
  "commandKey": "stroke",
  "payloadJson": "{\"powerPercent\":60,\"strokeMs\":250}"
}
```

### Command Message (to device)

`HardwareCommandMessageDto` includes:

- `correlationId` — Unique ID for ack matching
- `commandKey` — Action identifier
- `payloadJson` — Command parameters (stringified JSON)
- `accessToken` — Device validates against stored NVS token
- `deviceId`, `domTarget`, `subTarget` — Scope checks on device

### REST Response Semantics

`SendHardwareCommandResponseDto` fields:

| Field | Meaning |
|-------|---------|
| `delivered` | Hub sent `ExecuteCommand` to the paired device group |
| `acknowledged` | Device sent `AckCommand` within the timeout |
| `success` | Device ack reported `success: true` |
| `message` | Device message or dispatcher fallback |

**Phase 5 fix (2026-09-05):** `DeviceConnectionRegistry.WaitForAcknowledgementAsync` returns the full `HardwareCommandAckDto?`, not a boolean. The dispatcher now separates **ack received** from **ack success**:

| Outcome | `delivered` | `acknowledged` | `success` |
|---------|-------------|----------------|-----------|
| Device ack + success | `true` | `true` | `true` |
| Device ack + failure (validation, busy, etc.) | `true` | `true` | `false` |
| Timeout (no ack in 10 s) | `true` | `false` | `false` |
| Device offline / not paired | `false` | `false` | `false` |

Example — device rejected missing `strokeMs`:

```json
{
  "correlationId": "...",
  "delivered": true,
  "acknowledged": true,
  "success": false,
  "message": "strokeMs required"
}
```

### Ack Timeout

`HardwareCommandDispatcher` waits up to **10 seconds** for `AckCommand`. Long relay pulses (e.g. 5 s) still complete within this window; very long bursts/automatic sessions may need two-phase ack (future — [Device Plan §9](./09-ESP32-Device-Plan.md)).

---

## Command Keys

Aligned with UI constants (`types/hardwareCommand.ts`). **Firmware status** as of `0.6.0-phase6`:

| Key | Trigger | Typical Payload | Firmware |
|-----|---------|-----------------|----------|
| `stroke` | Manual stroke button | `{ powerPercent, strokeMs }` | **Implemented** — relay pulse on D4 |
| `abort` | Manual abort | `{}` | **Implemented** — cancels active stroke; dual ack on interrupt |
| `burst` | Manual burst button | `{ powerPercent, strokeMs, burstStrokes, burstDelayMs }` | Stub ack `"not implemented"` (Phase 9) |
| `automatic-start` | Automatic start | Automatic config snapshot | Stub ack (Phase 9) |
| `automatic-stop` | Automatic stop | `{ reason }` | Stub ack (Phase 9) |

**Stroke rules (firmware):** `strokeMs` required, > 0, max 30 000 ms. Overlapping commands while a pulse is active → reject with `success: false` (busy).

---

## Connection Registry

`DeviceConnectionRegistry` (singleton) maintains in-memory state:

| Data | Purpose |
|------|---------|
| Device connection ID by dom/sub | Verify device is online before dispatch |
| Pending ack tasks by correlationId | Async wait for device acknowledgment (stores full `HardwareCommandAckDto`) |
| Operator connections by dom | Forward acks to UI via `CommandAcknowledged` |

This is process-local memory — multi-instance deployment would require a Redis backplane or similar.

---

## Device Status

**GET /api/devices/status?subTarget=Slv66**

Returns:

- Whether a device is registered
- `deviceId`
- `isConnected` (live SignalR connection)
- `isPaired`, `pairedAt`, `lastConnectedAt`
- Token expiry info

Also surfaced via **GET /api/system/status?subTarget=Slv66** for header display. The React `SystemStatusProvider` passes the **selected Sub** as `subTarget` (Phase 4+).

---

## ESP32 Firmware

**Repository:** [`SomNet.Device/`](../SomNet.Device/) (PlatformIO, `board = esp32dev`)  
**Wire protocol:** [`SomNet.Device/docs/PROTOCOL.md`](../SomNet.Device/docs/PROTOCOL.md)  
**Implementation plan:** [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md)

Device JWT Sub claim is the device id; Sub **name** is claim `sub_target` (not `sub`).

### What is implemented (Phases 0–6)

| Phase | Capability |
|-------|------------|
| 0 | Protocol capture → `PROTOCOL.md` |
| 1 | PlatformIO scaffold, module tree, Wi-Fi |
| 2 | NVS + MAC `device_id` |
| 3 | Config web UI (Soft-AP provisioning, `/`, `/config`) |
| 4 | SignalR client — negotiate, WebSocket, `PairDevice`, reconnect |
| 5 | `ExecuteCommand` → `stroke` validation + `AckCommand`; handshake race fix |
| 6 | `relay_controller` GPIO pulse (`micros()` FSM), `abort`, measured `actualStrokeMs` in serial `resultJson` |

**Libraries:** `links2004/WebSockets`, `bblanchon/ArduinoJson`, `ESPAsyncWebServer` (config UI).

### Boot and pairing sequence

1. Read MAC → `deviceId` (`esp32-{12HEX}`); load NVS (Wi-Fi, server URL, token)
2. If not provisioned → Soft-AP + config UI; SignalR off until saved + reboot
3. `POST /hubs/hardware/negotiate?negotiateVersion=1` → `connectionToken`
4. WebSocket: unpaired `?id={token}&deviceId={id}` or paired `?id={token}&access_token={jwt}`
5. SignalR handshake → listen for `PairDevice` / `ExecuteCommand`
6. On `PairDevice` → persist token → disconnect → reconnect paired

### Handshake readiness (Phase 5)

`ExecuteCommand` can arrive before the `{}` handshake frame is processed. Firmware sets handshake complete on explicit `{}` **or** on any type-1 invocation, so the first command after connect is not spuriously rejected.

### After pairing — command execution

1. Validate `deviceId`, `accessToken`, `domTarget`, `subTarget` against NVS
2. Route `commandKey` through `command_handler` → `execution_context` → active mode
3. **`stroke`:** `SinglePulseMode` → `relay_controller.requestPulse(strokeMs)` — non-blocking FSM
4. **`abort`:** cancel active pulse; relay open; dual ack when interrupting a stroke
5. **`AckCommand`** from FSM completion callback (not from blocking code)
6. Serial logs `[CMD]`, `[RELAY]`, and `resultJson` for development

### Main loop order

Cooperative `loop()` in `main.cpp` (must not block):

```
wifi_manager → signalr_client → relay_controller → execution_context → command_handler → button_input → config_web_server
```

### Reconnection

- On disconnect, exponential backoff (1 s → 60 s cap); re-negotiate each attempt
- Paired + valid token → reconnect with `?access_token=`
- Token expired / revoked / type-7 close → clear pairing, reconnect unpaired with `?deviceId=`

### Dev networking

- ESP32 `server_url` must use the PC **LAN IP** (e.g. `http://192.168.1.47:5031`), not `localhost`
- Windows Firewall may block inbound TCP **5031** from LAN while Swagger on the same PC works — allow Private network rule for local dev

---

## UI Integration Status

| Feature | Status |
|---------|--------|
| API endpoints | ✅ Complete |
| SignalR hub | ✅ Complete |
| Command dispatcher (ack vs success) | ✅ Complete (Phase 5 fix) |
| Swagger JWT Authorize | ✅ Complete |
| **Pair / revoke device** | ✅ **Hardware** toolbar dialog (all Subs + unpaired list) |
| **Device status API** | ✅ Used by Hardware dialog + system status |
| **System status with subTarget** | ✅ `SystemStatusProvider` passes selected Sub |
| UI calls `/api/devices/commands` for stroke/abort | ✅ REST + device ack; session after ack |
| UI SignalR client for live acks | ❌ Not implemented (REST-only ack path) |
| Dedicated pairing dialog + pending list | ✅ Phase 8 |
| Session/history from device `resultJson` | ✅ `actualStrokeMs` on stroke; abort count on abort ack |

### Phase 8 — completed (2026-09-06)

1. `POST /api/devices/commands` from Manual mode Stroke/Abort buttons
2. Hardware toolbar dialog — all Subs admin, online unpaired list, paste device ID
3. `GET /api/devices/unpaired`; `resultJson` on shared DTOs and REST response
4. Session writes after device ack; burst/automatic UI disabled until Phase 9
5. Dev LAN: API reachability ping + firmware reconnect hardening (`0.8.10-phase8`)

See [Phase 8 Checklist](./09-ESP32-Phase-8-Checklist.md).

---

## Troubleshooting

| Symptom | Likely Cause |
|---------|--------------|
| Connection aborted | Missing `deviceId` and invalid/missing token |
| Negotiate / WS connection refused (ESP32 only) | Wrong server URL (`localhost` on device); Windows Firewall blocking LAN inbound 5031 |
| Command not delivered | Device offline or not paired |
| `delivered: true`, `acknowledged: false` | Device did not ack within 10 s; firmware hang; hub not connected |
| `acknowledged: true`, `success: false` | Device rejected command (validation, busy, not implemented key) — read `message` |
| `hub not ready` on first command (fixed Phase 5) | Handshake race — ensure firmware ≥ `0.5.0-phase5` |
| PairDevice not received | Device not in `unpaired:{deviceId}` group or wrong deviceId |
| 401 / type 7 on reconnect | Expired or revoked device token — re-pair |
| Stroke works in Swagger but not UI | UI should match Swagger — hard refresh browser if buttons still simulate ack |

**Development tip:** Use Swagger (Authorize with Dom JWT) + ESP32 serial monitor. Optional: browser devtools WebSocket tab on `/hubs/hardware` for frame inspection.

**Test command (Swagger):**

```json
{
  "subTarget": "Slv66",
  "commandKey": "stroke",
  "payloadJson": "{\"powerPercent\":50,\"strokeMs\":200}"
}
```
