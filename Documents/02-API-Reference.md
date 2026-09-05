# API Reference

SomNet exposes a REST API under `/api/*` and a SignalR hub at `/hubs/hardware`. All REST endpoints except authentication login/register require a valid operator JWT in the `Authorization: Bearer` header.

**Base URL (development):** `http://localhost:5031`

**Swagger UI (development only):** `http://localhost:5031/swagger`

## Dom Target Resolution

Most endpoints scope data to the authenticated **Dom**. The server resolves Dom identity as:

1. JWT `name` claim (display name), if present
2. Otherwise JWT `sub` claim (username)

This matches the UI, which uses `user.displayName` as the controller name.

---

## Authentication — `/api/auth`

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/auth/login` | Anonymous | Authenticate and receive JWT |
| POST | `/api/auth/register` | Anonymous | Create account and receive JWT |
| POST | `/api/auth/change-password` | Required | Change password; returns new token |
| GET | `/api/auth/me` | Required | Return current user profile |

### Login / Register Request

```json
{
  "username": "demo",
  "password": "demo"
}
```

### Login / Register Response

```json
{
  "user": {
    "username": "demo",
    "displayName": "Demo Dom"
  },
  "token": "<jwt>",
  "expiresAt": "2026-09-05T04:00:00Z"
}
```

**Validation rules:**
- Username: 3–32 characters, `[a-zA-Z0-9_-]+`
- Password: 8–128 characters

---

## Sessions — `/api/sessions`

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/sessions` | Start a new session |
| PATCH | `/api/sessions/{sessionId}` | Update in-progress session summary |
| POST | `/api/sessions/{sessionId}/end` | End session with final summary |

### Start Session

**Request body (`StartSessionRequestDto`):**

```json
{
  "subTarget": "Slv66",
  "mode": "Manual",
  "summary": "In progress"
}
```

**Response:** `SessionHistoryEntryDto` with generated ID (format `sess-001`, `sess-002`, …).

### Update Session

**Request body (`UpdateSessionRequestDto`):**

```json
{
  "summary": "In progress: 2 strokes at 60%, 1 burst at 75% (5 strokes @ 5s delay)."
}
```

### End Session

**Request body (`EndSessionRequestDto`):**

```json
{
  "summary": "2 strokes at 60%, 1 abort."
}
```

---

## History — `/api/history`

| Method | Route | Query Parameters | Description |
|--------|-------|------------------|-------------|
| GET | `/api/history/timeline` | `domTarget`, `subTarget`, optional `fromDate`, `toDate` | Sessions + notifications for a pair |
| GET | `/api/history/sessions` | `domTarget`, optional `subTarget` | Session list (Dom-wide or filtered) |

Timeline items are polymorphic JSON objects with a `type` field:

- `"session"` → session entry fields
- `"notification"` → notification entry fields

---

## Subs — `/api/subs`

Manage which Sub names appear under the authenticated Dom.

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/subs` | List subs for current Dom |
| POST | `/api/subs` | Add a sub assignment |
| DELETE | `/api/subs` | Remove sub (query: `subName`) |

### Add Sub Request

```json
{
  "subName": "Slv67"
}
```

**Sub name validation:**
- 2–32 characters
- Must start with a letter
- Characters: `[a-zA-Z0-9_-]+`

### List Composition

The subs list is built from:

1. Explicit `DomSubAssignments`
2. Distinct subs from past `Sessions`
3. Distinct subs from past `Notifications`

Minus any entries in `DomSubExclusions` (soft-hide after removal).

**Remove behavior:** Deletes assignment and `DomSubSettings`; adds exclusion so the name no longer appears in the list (historical records remain).

---

## Settings — `/api/settings`

Per Dom+Sub pairing settings stored as JSON.

| Method | Route | Query | Description |
|--------|-------|-------|-------------|
| GET | `/api/settings` | `subTarget` | Load `PairingSettingsDto` |
| PUT | `/api/settings` | `subTarget` | Save `PairingSettingsDto` |

### PairingSettingsDto Structure

```json
{
  "appOptions": { /* AppOptionsDto */ },
  "manual": { /* ManualControlStateDto */ },
  "automatic": { /* AutomaticControlStateDto */ }
}
```

Defaults are applied server-side when no record exists. Legacy millisecond-based power values are migrated to 0–100% on read via `PairingSettingsSerializer`.

---

## Notifications — `/api/notifications`

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/notifications` | Record a session notification |

**Request (`SendSessionNotificationRequestDto`):**

```json
{
  "subTarget": "Slv66",
  "sessionDateTime": "2026-09-10T18:00:00",
  "subject": "Upcoming Session"
}
```

Notifications are persisted to the database. Email delivery is planned but not implemented.

---

## System Status — `/api/system`

| Method | Route | Query | Description |
|--------|-------|-------|-------------|
| GET | `/api/system/status` | optional `subTarget` | Connection/hardware status |

When `subTarget` is provided, response includes device pairing and connection state for that Dom+Sub pair. Without it, returns general system status.

**Response fields include:** `connectionState` (`Unknown`, `Connecting`, `Online`, `Offline`), device pairing info when scoped.

---

## Devices — `/api/devices`

Hardware pairing and command dispatch (backend complete).

| Method | Route | Query / Body | Description |
|--------|-------|--------------|-------------|
| GET | `/api/devices/status` | `subTarget` | Device registration and connection status |
| POST | `/api/devices/pair` | `subTarget`, body: `{ deviceId }` | Pair device to Sub |
| DELETE | `/api/devices/pair` | `subTarget` | Revoke pairing |
| POST | `/api/devices/commands` | body: command request | Dispatch hardware command |

### Pair Device

**Request:**

```json
{
  "deviceId": "esp32-abc123"
}
```

**Response:** Pairing confirmation including token metadata (device receives token via SignalR `PairDevice` message).

### Send Command

**Request (`SendHardwareCommandRequestDto`):**

```json
{
  "subTarget": "Slv66",
  "commandKey": "stroke",
  "payloadJson": "{\"powerPercent\":60}"
}
```

**Response (`SendHardwareCommandResponseDto`):**

```json
{
  "delivered": true,
  "acknowledged": true,
  "success": true,
  "correlationId": "...",
  "message": "Command acknowledged"
}
```

Command keys used by the UI (defined in `hardwareCommand.ts`):

| Key | UI Action |
|-----|-----------|
| `stroke` | Manual stroke |
| `burst` | Manual burst |
| `abort` | Manual abort / end |
| `automatic-start` | Automatic session start |
| `automatic-stop` | Automatic session stop |

The dispatcher waits up to **10 seconds** for a device `AckCommand` callback.

---

## SignalR Hub — `/hubs/hardware`

Not a REST controller. See [SignalR & Hardware](./06-SignalR-And-Hardware.md).

**Connection URL examples:**

```
# Unpaired device (initial discovery)
ws://localhost:5031/hubs/hardware?deviceId=esp32-abc123

# Paired device
ws://localhost:5031/hubs/hardware?access_token=<device-jwt>

# Operator (optional future use)
ws://localhost:5031/hubs/hardware?access_token=<operator-jwt>
```

---

## Error Handling

| Status | Typical Cause |
|--------|---------------|
| 400 | Validation failure (sub name, request body) |
| 401 | Missing or expired JWT |
| 404 | Session or resource not found |
| 409 | Username already taken (register) |
| 500 | Unhandled server error |

The UI registers a global 401 handler that clears auth state and returns to the login screen.

---

## Service Layer

Controllers delegate to scoped services:

| Service | Responsibility |
|---------|----------------|
| `ISomNetDataStore` / `SomNetDataStore` | All EF Core data access |
| `IAuthService` / `AuthService` | Login, register, password change, JWT creation |
| `IDeviceTokenService` | Device JWT creation and registration persistence |
| `IDeviceConnectionRegistry` | In-memory SignalR connection tracking (singleton) |
| `IHardwareCommandDispatcher` | Command delivery and ack correlation |

---

## JSON Serialization

All API JSON uses camelCase property names via `SomNetJsonOptions.Configure()`, shared with SignalR protocol serialization. Enums serialize as camelCase strings (e.g. `"manual"`, `"automatic"`).
