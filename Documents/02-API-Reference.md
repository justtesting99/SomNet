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
| GET | `/api/sessions/active?subTarget=` | Latest **in-progress** session for Dom + Sub (404 if none) |
| POST | `/api/sessions` | Start a new session |
| PATCH | `/api/sessions/{sessionId}` | Update in-progress session summary |
| POST | `/api/sessions/{sessionId}/end` | End session with final summary |

### Get Active Session

**Query:** `subTarget` (required)

**Response:** `SessionHistoryEntryDto` for the most recent session whose summary is `"In progress"` or starts with `"In progress:"`.

**404** when no in-progress session exists for that Dom/Sub pair.

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
  "appOptions": {
    "enableSoundAlerts": true,
    "confirmBeforeCommands": false,
    "allowAutomaticModeOverrides": false,
    "autoExpandVideoOnMobile": true,
    "mobileVideoExpandDefault": "both",
    "showSessionTimestamps": true,
    "operatorDisplayName": "",
    "defaultNotesPrefix": "Session",
    "reconnectIntervalSeconds": 10,
    "videoFeedTimeoutSeconds": 30,
    "actionSnapshotFeeds": "both"
  },
  "manual": { /* ManualControlStateDto */ },
  "automatic": { /* AutomaticControlStateDto */ },
  "video": {
    "tunnelBaseUrl": ""
  }
}
```

**`allowAutomaticModeOverrides`** (default `false`) — when `true`, Automatic mode settings stay editable during a session and the UI sends **`automatic-update`** to the device (debounced). Persisted in `appOptions`; stripped from device command payloads (`running` is also UI-only and omitted on send).

**`videoFeedTimeoutSeconds`** (default `30`, range 5–600) — seconds to keep live video visible after manual stroke/burst idle or after automatic session end. See [16-Video-Phase-3-Session-Tokens-Checklist.md](./16-Video-Phase-3-Session-Tokens-Checklist.md).

**`mobileVideoExpandDefault`** (default `"both"`) — **Options → Live video feeds**: `"both"` \| `"monitor1"` (front only) \| `"monitor2"` (rear only). UI gates which session iframes mount; disabled cameras do not open a go2rtc stream ([Phase 6 V6-D17](./19-Video-Phase-6-Tunnel-Checklist.md)). On mobile, works with **`autoExpandVideoOnMobile`** for full-screen expand after commands. JSON uses camelCase enum strings (`VideoExpandMode`).

**`actionSnapshotFeeds`** (default `"both"`) — **Options → Action snapshot cameras**: `"both"` (front + rear stills) or `"rear"` (rear stills only). Read by `VideoSnapshotService` on hardware ack. **Does not** control live video iframes. Optional override on `POST /api/video/sessions/{sessionId}/snapshots` body field `feeds`.

**`video.tunnelBaseUrl`** (default empty) — optional split-origin video base for token embed paths; leave empty for same-origin `/go2rtc` through the tunneled API ([Phase 6](./19-Video-Phase-6-Tunnel-Checklist.md)).

### Video stream gateway — `/go2rtc/*`

When `Video:Edge:RequireTokenForGo2Rtc` is enabled (dev bench), requests under `/go2rtc` require a valid session stream token (`?token=` query or access cookie issued after first valid request). Missing, malformed, expired, or revoked tokens → **HTTP 403** with body *Video stream access requires a valid session token.* Public assets (`.js`, `.css`, etc.) under `/go2rtc` are exempt. See [Phase 5](./18-Video-Phase-5-Edge-Agent-Checklist.md) · [Phase 6](./19-Video-Phase-6-Tunnel-Checklist.md).

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
| GET | `/api/devices/unpaired` | — | Online unpaired devices (Dom JWT) |
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

### List Unpaired (online)

**Request:** `GET /api/devices/unpaired` (Dom JWT)

**Response:** Array of `{ deviceId, connectedAt }` for devices currently connected without a pairing token.

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
  "message": "Command acknowledged",
  "resultJson": "{\"commandKey\":\"stroke\",\"actualStrokeMs\":408,\"success\":true}"
}
```

On **abort during an active stroke**, the device sends two acks (stroke `success: false` with `interrupted: true` in `resultJson`, then abort `success: true`). Each REST command receives one response for its own `correlationId`.

**Automatic stop (Phase 10):** `automatic-stop` returns an **immediate** accept ack (no `resultJson`). Session summary arrives via operator hub `CommandAcknowledged` with `correlationId=automatic-session-complete`. See [SignalR & Hardware](./06-SignalR-And-Hardware.md) for per-command ack timeouts.

Command keys used by the UI (defined in `hardwareCommand.ts`):

| Key | UI Action |
|-----|-----------|
| `stroke` | Manual stroke |
| `burst` | Manual burst |
| `abort` | Manual abort / end |
| `automatic-start` | Automatic session start |
| `automatic-stop` | Automatic session stop |
| `automatic-update` | Live automatic settings — device replan after current stroke (**implemented**, Phase 11 signed off) |

The dispatcher uses **per-command ack timeouts** (stroke/abort 15 s, burst formula, `automatic-start`/`automatic-stop`/`automatic-update` 5 s). See [SignalR & Hardware](./06-SignalR-And-Hardware.md).

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
