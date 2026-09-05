# SomNet

ASP.NET Core 9 API and React/TypeScript UI for session control, Dom/Sub pairing, settings persistence, and ESP32 hardware integration via SignalR.

## Quick Start

```powershell
cd SomNet.API
dotnet run --launch-profile http
```

Open **http://localhost:5031** and sign in with demo credentials:

| Username | Password |
|----------|----------|
| `demo` | `demo` |

## Solution Structure

```
SomNet/
├── SomNet.API/       ASP.NET Core host (REST, SignalR, EF Core, static UI)
├── SomNet.Shared/    Shared DTOs, enums, models
├── SomNet.UI/        React + TypeScript + Vite + Tailwind
├── Documents/        Technical documentation and user guide
└── data/             SQL LocalDB attach files (local dev)
```

**Solution file:** `SomNet.API/SomNet.slnx`

## Documentation

Full documentation lives in the [`Documents/`](Documents/) folder:

| Document | Description |
|----------|-------------|
| [System Overview](Documents/01-System-Overview.md) | High-level architecture and data flows |
| [API Reference](Documents/02-API-Reference.md) | REST endpoints and DTOs |
| [Frontend Architecture](Documents/03-Frontend-Architecture.md) | React providers, modes, UI structure |
| [Database Schema](Documents/04-Database-Schema.md) | Entities, migrations, seed data |
| [Authentication & Security](Documents/05-Authentication-And-Security.md) | JWT, device tokens, authorization |
| [SignalR & Hardware](Documents/06-SignalR-And-Hardware.md) | ESP32 pairing and command protocol |
| [Session & History](Documents/07-Session-And-History.md) | Session lifecycle and summaries |
| [Development Guide](Documents/08-Development-Guide.md) | Local setup, ports, troubleshooting |
| [User Guide](Documents/User-Guide.md) | Operator how-to |

See [Documents/README.md](Documents/README.md) for the full index.

## Tech Stack

- **Backend:** ASP.NET Core 9, EF Core, SignalR, JWT auth
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **Database:** SQL Server LocalDB (dev)

## Status

| Area | Status |
|------|--------|
| REST API + LocalDB | Complete |
| React UI (auth, modes, settings, history) | Complete |
| Dom/Sub management | Complete |
| SignalR hub + device pairing (API) | Complete |
| UI → hardware command dispatch | Stub (simulated ack) |
| Email notifications | Future |

## License

Not specified.
