# System Overview

SomNet is a full-stack web application for controlling and recording sessions between a **Dom** (controller/operator) and a **Sub** (target participant). The system persists settings per Dom+Sub pairing, tracks session and notification history, and provides a SignalR pathway for ESP32 hardware devices to receive commands securely.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Browser (SomNet.UI)                             │
│  React 18 · TypeScript · Vite · Tailwind CSS                            │
│  JWT stored in localStorage · REST via fetch                            │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ HTTPS/HTTP
                                │ Authorization: Bearer <token>
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      SomNet.API (ASP.NET Core 9)                        │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐  │
│  │ Controllers │  │   Services   │  │  SignalR    │  │  Static SPA   │  │
│  │  REST API   │  │  DataStore   │  │ HardwareHub │  │  (UI dist)    │  │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘  └───────────────┘  │
│         │                │                 │                            │
│         └────────────────┼─────────────────┘                            │
│                          ▼                                              │
│                   EF Core (SomNetDbContext)                             │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  SQL Server LocalDB  │
                    │  data/SomNet.mdf     │
                    └──────────────────────┘

                               ▲
                               │ WebSocket / SignalR
                               │ /hubs/hardware
                               │
                    ┌──────────────────────┐
                    │   ESP32 Device       │
                    │   (paired per Sub)   │
                    └──────────────────────┘
```

## Projects

| Project | Technology | Role |
|---------|------------|------|
| **SomNet.API** | ASP.NET Core 9, EF Core, SignalR | Hosts REST API, SignalR hub, database access, and serves the built React UI |
| **SomNet.Shared** | .NET 9 class library | Shared DTOs, enums, validation models, and JSON serialization configuration used by both API and (indirectly) UI via TypeScript types |
| **SomNet.UI** | React 18, TypeScript, Vite, Tailwind | Single-page operator interface; builds to `dist/` and is embedded in the API build |

## Core Concepts

### Dom and Sub

- **Dom** — The authenticated operator. Identified by JWT claims: `name` (display name) preferred, else `sub` (username).
- **Sub** — A named target participant (string, e.g. `Slv66`). Selected in the UI header; all settings, sessions, and device pairing are scoped to the current Dom+Sub pair.

### Operation Modes

| Mode | Purpose |
|------|---------|
| **Manual** | Operator triggers individual strokes and bursts; session starts lazily on first action |
| **Automatic** | Operator starts/stops an automated session; timing and power ranges configured in settings |

### Pairing Settings

Each Dom+Sub combination has persisted settings stored as JSON in `DomSubSettings`:

- **App options** — UI preferences (sound, confirmations, video expand behavior)
- **Manual control state** — Power %, stroke duration range, burst parameters
- **Automatic control state** — Run mode, power/timing ranges, end-session rules, burst style

Settings load when a Sub is selected and save automatically (debounced) when changed.

### Sessions and History

- **Live sessions** — Created via API when manual actions begin or automatic mode starts; updated in real time with rich summaries
- **History timeline** — Merges completed sessions and sent notifications for a Dom+Sub pair
- **Dom sessions view** — Cross-sub session list for the current Dom

### Hardware Integration

ESP32 devices connect to the SignalR hub at `/hubs/hardware`. Pairing binds a physical device to a specific Dom+Sub pair via a long-lived device JWT. Commands are dispatched through the hub and acknowledged by the device.

> **Note:** The backend hardware pipeline is complete. The React UI currently uses a simulated command acknowledgment (450 ms timeout) and does not yet call `/api/devices/commands` or subscribe to SignalR for live acks.

## Request Flow Examples

### Operator Login

```
Browser → POST /api/auth/login { username, password }
       ← { user, token, expiresAt }
Browser stores token in localStorage (somnet-auth)
Subsequent requests include Authorization: Bearer <token>
```

### Manual Stroke

```
User clicks Stroke
  → UI records event in SessionProvider event log
  → If no active session: POST /api/sessions
  → PATCH /api/sessions/{id} with aggregated summary
  → CommandButton shows pending state (simulated ack today)
```

### Settings Change

```
User adjusts power slider
  → OptionsProvider updates local state
  → Debounced PUT /api/settings?subTarget=Slv66
  → SomNetDataStore serializes PairingSettingsDto to DomSubSettings.SettingsJson
```

### Device Pairing (API-ready)

```
Dom → POST /api/devices/pair?subTarget=Slv66 { deviceId }
API → Creates device JWT, persists SubDeviceRegistration
API → SignalR PairDevice to unpaired:{deviceId} group
ESP32 → Stores token, reconnects with access_token query param
ESP32 → Joins paired:{dom}:{sub} group
```

## Deployment Model (Current)

- **Development:** Single process — API serves UI static files from `SomNet.UI/dist`
- **Database:** SQL Server LocalDB with attach file at `data/SomNet.mdf`
- **Migrations:** Applied automatically on API startup
- **Seed data:** Demo user and sample history inserted when database is empty

Production deployment (e.g. Azure SQL, separate CDN for UI) is not yet configured but the architecture supports it.

## Security Summary

| Layer | Mechanism |
|-------|-----------|
| Operator API | JWT (audience `SomNet.UI`), required on all endpoints except login/register |
| Device API / Hub | Separate JWT (audience `SomNet.Device`), scoped to dom/sub/device_id |
| SignalR WebSocket | Token via `?access_token=` query parameter on `/hubs/*` paths |
| Password storage | ASP.NET Core `PasswordHasher<User>` |
| Command targeting | Dispatcher verifies active registration + live connection before sending |

See [Authentication & Security](./05-Authentication-And-Security.md) for details.

## Document Map

For deeper coverage:

- REST endpoints → [API Reference](./02-API-Reference.md)
- React structure → [Frontend Architecture](./03-Frontend-Architecture.md)
- Tables and migrations → [Database Schema](./04-Database-Schema.md)
- ESP32 protocol → [SignalR & Hardware](./06-SignalR-And-Hardware.md)
- Session summaries → [Session & History](./07-Session-And-History.md)
- Local dev → [Development Guide](./08-Development-Guide.md)
- Operator usage → [User Guide](./User-Guide.md)
