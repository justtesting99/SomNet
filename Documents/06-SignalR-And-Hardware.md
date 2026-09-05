# SignalR & Hardware Integration

SomNet provides real-time communication between the API and ESP32 hardware devices through a SignalR hub. The backend pairing and command pipeline is complete; the React UI has not yet been wired to use it.

## Hub Endpoint

```
/hubs/hardware
```

**Implementation:** `SomNet.API/Hubs/HardwareHub.cs`

Registered in `Program.cs`:

```csharp
app.MapHub<HardwareHub>("/hubs/hardware");
```

SignalR JSON protocol uses the same `SomNetJsonOptions` camelCase serialization as the REST API.

---

## Connection Types

When a client connects, `OnConnectedAsync` classifies the connection:

| Connection | How identified | Group joined | Capabilities |
|------------|----------------|--------------|--------------|
| **Paired device** | JWT with `role=device` | `paired:{dom}:{sub}` | Receive commands, send acks |
| **Operator** | JWT with operator audience | `operator:{dom}` | Receive command ack notifications (future UI) |
| **Unpaired device** | Query `?deviceId=...` (no auth) | `unpaired:{deviceId}` | Receive pairing token only |
| **Invalid** | None of the above | — | Connection aborted |

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
| `AckCommand` | Ack with correlationId, success | Paired device | Confirm command execution |

---

## Pairing Flow

```
┌──────────┐                    ┌──────────┐                    ┌──────────┐
│  ESP32   │                    │   API    │                    │ Dom (UI) │
└────┬─────┘                    └────┬─────┘                    └────┬─────┘
     │  Connect ?deviceId=abc        │                               │
     │──────────────────────────────►│                               │
     │  Join unpaired:abc            │                               │
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
{ "deviceId": "esp32-abc123" }
```

**Server actions:**
1. Validate Dom owns subTarget
2. Generate device JWT via `DeviceTokenService`
3. Upsert `SubDeviceRegistration` (deviceId, token, jti, expiry)
4. Send `PairDevice` to `unpaired:{deviceId}` and `paired:{dom}:{sub}` groups
5. Return pairing metadata to caller

**Revoke:** `DELETE /api/devices/pair?subTarget=Slv66` — sets `IsRevoked`, clears active connection.

---

## Command Dispatch Flow

```
┌──────────┐                    ┌──────────┐                    ┌──────────┐
│ Dom (UI) │                    │   API    │                    │  ESP32   │
└────┬─────┘                    └────┬─────┘                    └────┬─────┘
     │  POST /api/devices/commands   │                               │
     │  { subTarget, commandKey }    │                               │
     │──────────────────────────────►│                               │
     │                               │  Verify registration + conn   │
     │                               │  ExecuteCommand               │
     │                               │──────────────────────────────►│
     │                               │                               │ Execute
     │                               │  AckCommand(correlationId)    │
     │                               │◄──────────────────────────────│
     │                               │  CommandAcknowledged → operator group
     │  { delivered, acknowledged }  │                               │
     │◄──────────────────────────────│                               │
```

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
- `payloadJson` — Command parameters
- `accessToken` — Device validates against stored token

### Ack Timeout

`HardwareCommandDispatcher` waits up to **10 seconds** for `AckCommand`. Returns partial success if delivered but not acknowledged.

---

## Command Keys

Aligned with UI constants (`types/hardwareCommand.ts`):

| Key | Trigger | Typical Payload |
|-----|---------|-----------------|
| `stroke` | Manual stroke button | `{ powerPercent, strokeMs }` |
| `burst` | Manual burst button | `{ powerPercent, burstStrokes, burstDelaySeconds }` |
| `abort` | Manual abort | `{}` |
| `automatic-start` | Automatic start | Automatic config snapshot |
| `automatic-stop` | Automatic stop | `{ reason }` |

---

## Connection Registry

`DeviceConnectionRegistry` (singleton) maintains in-memory state:

| Data | Purpose |
|------|---------|
| Device connection ID by dom/sub | Verify device is online before dispatch |
| Pending ack tasks by correlationId | Async wait for device acknowledgment |
| Operator connections by dom | Forward acks to UI (future) |

This is process-local memory — multi-instance deployment would require a Redis backplane or similar.

---

## Device Status

**GET /api/devices/status?subTarget=Slv66**

Returns:

- Whether a device is registered
- `deviceId`
- `isConnected` (live SignalR connection)
- `pairedAt`, `lastConnectedAt`
- Token expiry info

Also surfaced via **GET /api/system/status?subTarget=Slv66** for header display (UI does not yet pass subTarget).

---

## ESP32 Implementation Guide

**Authoritative wire capture:** [`SomNet.Device/docs/PROTOCOL.md`](../SomNet.Device/docs/PROTOCOL.md) (Phase 0, 2026-09-05).

Device JWT Sub claim is the device id; Sub **name** is claim `sub_target` (not `sub`).

### Initial Boot

1. Read MAC → `deviceId` (`esp32-{MAC}`)
2. `POST /hubs/hardware/negotiate?negotiateVersion=1` → `connectionToken`
3. Connect WebSocket `?id={connectionToken}&deviceId={id}`
4. SignalR handshake (§ PROTOCOL.md)
5. Listen for `PairDevice` event
6. Persist token to NVS/flash

### After Pairing

1. Disconnect unpaired connection
2. Reconnect with `?access_token={stored-token}`
3. Listen for `ExecuteCommand`
4. Validate `accessToken` in message matches stored token
5. Execute hardware action (GPIO, PWM, etc.)
6. Call `AckCommand` with `correlationId` and `success` flag

### Reconnection

- On disconnect, retry with stored device JWT
- If token expired/revoked, fall back to unpaired `?deviceId=` and wait for re-pair

### Recommended Libraries

- Arduino/ESP32: WebSockets client + JSON parsing
- SignalR protocol: implement handshake + JSON message envelope, or use a lightweight SignalR client port

---

## UI Integration Status

| Feature | Status |
|---------|--------|
| API endpoints | ✅ Complete |
| SignalR hub | ✅ Complete |
| Command dispatcher | ✅ Complete |
| UI calls `/api/devices/commands` | ❌ Uses simulated 450ms ack |
| UI SignalR client for acks | ❌ Not implemented |
| Device pairing dialog | ❌ Not implemented |
| System status with subTarget | ❌ Polls without sub param |

### Planned UI Changes

1. Replace `waitForHardwareAck` in `hardwareCommandAck.ts` with API call
2. Add `@microsoft/signalr` client in `HardwareCommandProvider` for live acks
3. Add pairing UI (device ID entry, status indicator)
4. Pass selected sub to `SystemStatusProvider` poll URL

---

## Troubleshooting

| Symptom | Likely Cause |
|---------|--------------|
| Connection aborted | Missing deviceId and invalid/missing token |
| Command not delivered | Device offline or not paired |
| Command delivered, not acked | Device firmware not calling AckCommand |
| PairDevice not received | Device not in unpaired group or wrong deviceId |
| 401 on reconnect | Expired or revoked device token |

**Development tip:** Use Swagger + a SignalR test client, or browser devtools WebSocket tab on `/hubs/hardware`.
