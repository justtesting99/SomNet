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
├── SomNet.Device/    PlatformIO ESP32 firmware (Cursor/VS Code + PlatformIO; not in .slnx)
├── Documents/        Technical documentation and user guides
└── data/             SQL LocalDB attach files (local dev)
```

**Solution file:** `SomNet.API/SomNet.slnx`

## Documentation

Full documentation lives in the [`Documents/`](Documents/) folder. See [Documents/README.md](Documents/README.md) for the complete index.

| Document | Description |
|----------|-------------|
| [System Overview](Documents/01-System-Overview.md) | High-level architecture and data flows |
| [API Reference](Documents/02-API-Reference.md) | REST endpoints and DTOs |
| [Frontend Architecture](Documents/03-Frontend-Architecture.md) | React providers, modes, UI structure |
| [Authentication & Security](Documents/05-Authentication-And-Security.md) | JWT, device tokens, authorization |
| [SignalR & Hardware](Documents/06-SignalR-And-Hardware.md) | Hub protocol, pairing, command dispatch, firmware/UI status |
| [Development Guide](Documents/08-Development-Guide.md) | Local setup, ports, troubleshooting |
| [User Guide](Documents/User-Guide.md) | Operator how-to (web app) |
| [Hardware User Guide](Documents/Hardware-User-Guide.md) | ESP32 setup, Wi‑Fi provisioning, Device ID, pairing |
| [ESP32 Device Plan](Documents/09-ESP32-Device-Plan.md) | Firmware plan — **source of truth** (Phases 0–5 complete, Phase 6 signed off) |
| [SomNet.Device/README](SomNet.Device/README.md) | Build, flash, and test ESP32 firmware |

**ESP32 phase checklists:** [0](Documents/09-ESP32-Phase-0-Checklist.md) · [1](Documents/09-ESP32-Phase-1-Checklist.md) · [2](Documents/09-ESP32-Phase-2-Checklist.md) · [3](Documents/09-ESP32-Phase-3-Checklist.md) · [4](Documents/09-ESP32-Phase-4-Checklist.md) · [5](Documents/09-ESP32-Phase-5-Checklist.md) · [6](Documents/09-ESP32-Phase-6-Checklist.md) · [7](Documents/09-ESP32-Phase-7-Checklist.md) — **0–5 Complete**, **6 Signed off**, **7 Next**

## ESP32 firmware (quick pointer)

Firmware lives in [`SomNet.Device/`](SomNet.Device/). Current release track: **`0.6.0-phase6`** — SignalR pairing, `stroke` relay control on **D4**, `abort` during active pulse.

```bash
cd SomNet.Device
pio run -t upload
pio device monitor
```

Copy `secrets.ini.example` → `secrets.ini` with your Wi‑Fi and PC **LAN IP** (not `localhost`). Pair the device ID from the ESP32 status page via SomNet **Options → Hardware device**, or Swagger. Test strokes with `POST /api/devices/commands` — see [SignalR & Hardware](Documents/06-SignalR-And-Hardware.md).

## Tech Stack

- **Backend:** ASP.NET Core 9, EF Core, SignalR, JWT auth
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **Device:** ESP32 (PlatformIO / Arduino), WebSocket SignalR client
- **Database:** SQL Server LocalDB (dev)

## Status

| Area | Status |
|------|--------|
| REST API + LocalDB | Complete |
| React UI (auth, modes, settings, history) | Complete |
| Dom/Sub management | Complete |
| SignalR hub + device pairing (API) | Complete |
| ESP32 firmware (pairing, `stroke`, relay) | **Phase 6 signed off**; **Phase 7 next** ([checklist](Documents/09-ESP32-Phase-7-Checklist.md)) |
| UI device pairing (Options panel) | Minimal — complete for dev |
| UI → hardware command dispatch | Stub (simulated ack) — Phase 8 |
| Email notifications | Future |

## License

Not specified.
