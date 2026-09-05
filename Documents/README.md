# SomNet Documentation

Technical and user documentation for the SomNet system — an ASP.NET Core 9 API with a React/TypeScript UI for session control, Dom/Sub pairing, settings persistence, and ESP32 hardware integration via SignalR.

## Document Index

| Document | Audience | Description |
|----------|----------|-------------|
| [System Overview](./01-System-Overview.md) | All | High-level architecture, major components, and data flows |
| [API Reference](./02-API-Reference.md) | Developers | REST endpoints, request/response shapes, and controller behavior |
| [Frontend Architecture](./03-Frontend-Architecture.md) | Developers | React provider tree, UI modes, dialogs, and client-side state |
| [Database Schema](./04-Database-Schema.md) | Developers | Entities, relationships, migrations, and seed data |
| [Authentication & Security](./05-Authentication-And-Security.md) | Developers | Operator JWT, device tokens, and authorization model |
| [SignalR & Hardware](./06-SignalR-And-Hardware.md) | Developers | ESP32 pairing, command dispatch, and hub protocol |
| [Session & History](./07-Session-And-History.md) | Developers | Live session lifecycle, summaries, and timeline aggregation |
| [Development Guide](./08-Development-Guide.md) | Developers | Local setup, ports, build pipeline, and common tasks |
| [User Guide](./User-Guide.md) | Operators | How to use the web application day to day |

## Solution Structure

```
SomNet/
├── Documents/           ← This folder
├── data/                ← SQL LocalDB attach files (SomNet.mdf)
├── SomNet.API/          ← ASP.NET Core host (REST, SignalR, EF Core, static UI)
├── SomNet.Shared/       ← Shared DTOs, enums, models, JSON options
└── SomNet.UI/           ← React + TypeScript + Vite + Tailwind
```

**Solution file:** `SomNet.API/SomNet.slnx`

## Quick Start

1. Run the API from `SomNet.API` (F5 or `dotnet run`) — default URL: `http://localhost:5031`
2. Sign in with demo credentials: username `demo`, password `demo`
3. Select a Sub, choose Manual or Automatic mode, and begin a session

See [Development Guide](./08-Development-Guide.md) for full setup details and [User Guide](./User-Guide.md) for operator workflows.

## Current Integration Status

| Area | Status |
|------|--------|
| REST API + LocalDB | Complete |
| React UI (auth, modes, settings, history) | Complete |
| Dom/Sub management | Complete |
| Per-pairing settings persistence | Complete |
| SignalR hub + device pairing (API) | Complete |
| UI → hardware command dispatch | **Stub** — UI simulates ack; backend ready |
| Operator SignalR client in UI | **Not wired** |
| Email notifications | **Future** — stored in DB only |

## Related Paths

| Resource | Location |
|----------|----------|
| API entry point | `SomNet.API/Program.cs` |
| Database context | `SomNet.API/Data/SomNetDbContext.cs` |
| React entry point | `SomNet.UI/src/main.tsx` |
| Shared DTOs | `SomNet.Shared/DTO/` |
| Hardware hub | `SomNet.API/Hubs/HardwareHub.cs` |
