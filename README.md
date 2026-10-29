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
| [ESP32 Device Plan](Documents/09-ESP32-Device-Plan.md) | Firmware plan — **source of truth** (Phases 0–12 signed off) |
| [UI Session Rehydration](Documents/10-UI-Session-Rehydration-Checklist.md) | Browser refresh during automatic session — **signed off** |
| [UI Manual Session Rehydration](Documents/11-UI-Manual-Session-Rehydration-Checklist.md) | Browser refresh during manual session — **signed off** |
| [UI Multi-Tab Sync](Documents/12-UI-Multi-Tab-Sync-Checklist.md) | Live state across browser tabs — **signed off** |
| [SomNet.Device/README](SomNet.Device/README.md) | Build, flash, and test ESP32 firmware |

**ESP32 phase checklists:** [0](Documents/09-ESP32-Phase-0-Checklist.md) · … · [12](Documents/09-ESP32-Phase-12-Network-Hardening-Checklist.md) · [button clicks](Documents/23-Device-Button-Clicks-Checklist.md) · [Session in Progress (P16)](Documents/25-Session-Accessory-In-Progress-Checklist.md) · [UI rehydration](Documents/10-UI-Session-Rehydration-Checklist.md) · [multi-tab sync](Documents/12-UI-Multi-Tab-Sync-Checklist.md)

## ESP32 firmware (quick pointer)

Firmware lives in [`SomNet.Device/`](SomNet.Device/). Current release track: **`0.16.4-motor-burst-duty`** (`platformio.ini`) — unified binary: relay **burst placement** ([doc 36](Documents/36-Burst-Placement-Modes-Design.md)), **motor automatic** programs + bursts ([doc 31 §5.2.1](Documents/31-Motor-Actuator-Device-Design.md#521-bursts-in-motor-automatic-design-locked-2026-10-27), [32 M1d](Documents/32-Motor-Actuator-Implementation-Plan-And-Checklist.md#52-phase-m1d--motor-automatic-bursts--placement-bp-e)), P16 **`0.15.0-session-accessory`**. Operator pattern graph: [03 Frontend — Motor pattern graph](Documents/03-Frontend-Architecture.md#motor-pattern-graph-scope).

```bash
cd SomNet.Device
pio run -t upload
pio device monitor
```

Copy `secrets.ini.example` → `secrets.ini` with your Wi‑Fi and PC **LAN IP** (not `localhost`). Pair the device ID from the ESP32 status page via the SomNet **Hardware** toolbar dialog, or Swagger. Test strokes with `POST /api/devices/commands` — see [SignalR & Hardware](Documents/06-SignalR-And-Hardware.md).

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
| ESP32 firmware (pairing, stroke/burst/automatic, session accessory, burst placement, motor automatic) | **Phases 0–12 + P16 + motor M1d signed off** — firmware **`0.16.4-motor-burst-duty`** ([32](Documents/32-Motor-Actuator-Implementation-Plan-And-Checklist.md)) |
| Motor hub path (automatic modes, bursts, pattern graph) | **M1 + M1b + M1c + M1d signed off** **2026-10-28** — [31 §13](Documents/31-Motor-Actuator-Device-Design.md#13-as-built--hub-path-motor-programs-ui-telemetry) |
| SomEsp / LAN **`/operate`** + local API (motor + relay) | **M2 signed off** **2026-10-28** — [32 Phase M2](Documents/32-Motor-Actuator-Implementation-Plan-And-Checklist.md#phase-m2-sign-off) · [27 SomEsp](Documents/27-SomEsp-Standalone-Device-Plan.md) |
| Session in Progress (UI + GPIO32 lock) | **Signed off** — [P16 checklist](Documents/25-Session-Accessory-In-Progress-Checklist.md) |
| UI device pairing | **Hardware** toolbar dialog (Phase 8) |
| UI → hardware command dispatch | **Complete** — REST + operator hub listener (Phases 8–11) |
| UI automatic session rehydration (browser refresh) | **Complete** — [checklist](Documents/10-UI-Session-Rehydration-Checklist.md) |
| Email notifications | Future |

## License

Not specified.
