# Authentication & Security

SomNet uses JSON Web Tokens (JWT) for both operator (UI) and device (ESP32) authentication. Passwords are hashed with ASP.NET Core's built-in hasher.

## Configuration

Settings in `appsettings.json` / `appsettings.Development.json` under the `Jwt` section:

| Setting | Dev Value | Purpose |
|---------|-----------|---------|
| `Key` | 32+ character secret | HMAC-SHA256 signing key |
| `Issuer` | `SomNet` | Token issuer |
| `Audience` | `SomNet.UI` | Operator token audience |
| `DeviceAudience` | `SomNet.Device` | Device token audience |
| `ExpireMinutes` | 480 (8 hours) | Operator token lifetime |
| `DeviceExpireDays` | 365 | Device token lifetime |

Configuration is bound to `JwtSettings` (`Configuration/JwtSettings.cs`) with startup validation (key length, required fields).

---

## Operator Authentication

### Login Flow

```
1. POST /api/auth/login { username, password }
2. AuthService validates credentials against Users table
3. JWT created with claims:
     sub  = username
     name = displayName
     jti  = unique GUID
   Audience = SomNet.UI
4. Response includes token + expiresAt
5. UI stores in localStorage (somnet-auth)
6. All apiFetch calls add: Authorization: Bearer <token>
```

### Session Restore

On page load:

1. Read `somnet-auth` from localStorage
2. Check token expiry client-side
3. If valid, call `GET /api/auth/me` to confirm
4. On 401, clear storage and show login

### Registration

Same flow as login after account creation. Returns 409 if username exists.

### Password Change

`POST /api/auth/change-password` requires authentication. Returns a new JWT on success.

### Password Rules

| Field | Rule |
|-------|------|
| Username | 3–32 chars, `[a-zA-Z0-9_-]+` |
| Password | 8–128 chars |

Hashing: `PasswordHasher<User>` (PBKDF2 with HMAC-SHA256, ASP.NET Identity default).

---

## JWT Validation (API)

Configured in `Program.cs`:

```csharp
ValidAudiences = [jwtSettings.Audience, jwtSettings.DeviceAudience]
NameClaimType = JwtRegisteredClaimNames.Sub
```

- Both operator and device tokens validate against the same signing key
- Audience claim determines token type
- `[Authorize]` on controllers accepts either audience (device tokens typically only hit the hub)

### SignalR Token Delivery

WebSocket connections cannot set Authorization headers in all clients. For paths under `/hubs`:

```
?access_token=<jwt>
```

The JWT bearer middleware reads this query parameter in `OnMessageReceived`.

---

## Device Authentication

Devices receive a separate JWT during pairing, distinct from operator tokens.

### Device JWT Claims

| Claim | Value |
|-------|-------|
| `role` | `device` |
| `device_id` | ESP32 identifier |
| `dom` | Dom display name |
| `sub` | Sub name |
| `jti` | Unique token ID |
| Audience | `SomNet.Device` |

### Pairing Security Model

1. **Unpaired connection** — Device connects with `?deviceId=` only (no auth). Joins `unpaired:{deviceId}` group. Cannot receive commands.
2. **Operator initiates pairing** — Authenticated Dom calls `POST /api/devices/pair` with `deviceId`. Server verifies Dom owns the subTarget.
3. **Token delivery** — Server creates device JWT, persists `SubDeviceRegistration`, sends `PairDevice` message via SignalR containing the token.
4. **Device stores token** — ESP32 saves token in persistent memory (flash/NVS).
5. **Paired reconnection** — Device reconnects with `?access_token=<device-jwt>`. Hub validates token, registers connection, joins `paired:{dom}:{sub}` group.
6. **Command targeting** — Only the device in the paired group for that Dom+Sub receives `ExecuteCommand` messages. Token is included in command payload for device-side verification.

### Revocation

`DELETE /api/devices/pair?subTarget=` marks registration as revoked and disconnects active connections. Device must re-pair to receive a new token.

---

## Authorization Model

### REST API

| Endpoint group | Requirement |
|----------------|-------------|
| `/api/auth/login`, `/api/auth/register` | Anonymous |
| All other `/api/*` | `[Authorize]` — valid operator OR device JWT |
| Dom-scoped data | Resolved from JWT `name` or `sub` claim |

Device JWTs are not typically used for REST endpoints — they exist primarily for SignalR hub authentication.

### Dom Target Resolution

Server-side helper (controllers):

```
domTarget = User.FindFirst("name")?.Value
         ?? User.FindFirst("sub")?.Value
```

This ensures settings, sessions, and subs are isolated per operator.

### Cross-Dom Isolation

Database queries always filter by `DomTarget`. Seed data includes examples proving one Dom cannot access another's sessions via API.

---

## Command Security

When dispatching hardware commands:

1. Verify operator JWT (via `[Authorize]`)
2. Verify `SubDeviceRegistration` exists and is not revoked
3. Verify device has active SignalR connection in `DeviceConnectionRegistry`
4. Include `accessToken` in `ExecuteCommand` payload — device validates it matches stored token
5. Device calls `AckCommand` with correlation ID
6. Dispatcher waits up to 10 seconds for acknowledgment

This prevents:
- Commands to unpaired devices
- Commands to wrong Sub (group isolation)
- Replay by unauthenticated clients (token required on device)

---

## UI Security Considerations

| Topic | Current State |
|-------|---------------|
| Token storage | localStorage (XSS-vulnerable — acceptable for local dev) |
| HTTPS | Production redirect enabled; dev uses HTTP |
| CSRF | Not applicable (Bearer token, not cookies) |
| Token refresh | No refresh token — re-login after expiry |
| Device pairing UI | Not exposed — pairing via API only |

### Production Recommendations

- Use HTTPS exclusively
- Consider httpOnly secure cookies or short-lived tokens with refresh
- Rotate JWT signing key via configuration/secrets manager
- Do not commit production keys to source control
- Hash or encrypt device tokens at rest in database
- Rate-limit auth endpoints

---

## Claim Type Constants

Defined in `SomNet.Shared/Models/DeviceConstants.cs`:

```csharp
DeviceClaimTypes.Role       = "role"
DeviceClaimTypes.DeviceRole = "device"
DeviceClaimTypes.OperatorRole = "operator"
DeviceClaimTypes.DomTarget  = "dom"
DeviceClaimTypes.SubTarget  = "sub_target"
DeviceClaimTypes.DeviceId   = "device_id"
```

Hub group naming:

```csharp
HardwareHubGroups.Unpaired(deviceId)  → "unpaired:{deviceId}"
HardwareHubGroups.Paired(dom, sub)    → "paired:{dom}:{sub}"
HardwareHubGroups.Operator(dom)       → "operator:{dom}"
```
