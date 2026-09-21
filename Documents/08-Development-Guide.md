# Development Guide

This guide covers local setup, build pipeline, and common development tasks for SomNet.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| .NET SDK | 9.0+ | API and Shared projects |
| Node.js | 18+ (LTS recommended) | UI build |
| npm | Bundled with Node | UI dependencies |
| SQL Server LocalDB | Installed with VS / Build Tools | Database |
| Visual Studio 2022 or VS Code | Optional | IDE |

Verify installations:

```powershell
dotnet --version
node --version
npm --version
sqllocaldb info
```

---

## Repository Layout

```
D:\MoreRepos\SomNet\
├── data\                  # Auto-created LocalDB files
│   ├── SomNet.mdf
│   └── SomNet_log.ldf
├── Documents\             # This documentation
├── SomNet.API\            # ASP.NET Core host
├── SomNet.Shared\         # Shared library
└── SomNet.UI\             # React frontend
```

**Solution file:** `SomNet.API/SomNet.slnx`

---

## First-Time Setup

### 1. Restore dependencies

```powershell
cd D:\MoreRepos\SomNet\SomNet.UI
npm install

cd D:\MoreRepos\SomNet\SomNet.API
dotnet restore
```

### 2. Run the API

```powershell
cd D:\MoreRepos\SomNet\SomNet.API
dotnet run --launch-profile http
```

On first run:
- Creates `data/` directory and attaches `SomNet.mdf`
- Applies EF Core migrations
- Seeds demo user and sample data
- Builds UI (`npm run build` via MSBuild target) and serves from `/`

**URL:** http://localhost:5031

**Demo login:** username `demo`, password `demo`

### 3. Optional — UI dev server with HMR

Run API and UI separately for hot module replacement:

```powershell
# Terminal 1 — API
cd D:\MoreRepos\SomNet\SomNet.API
dotnet run --launch-profile http

# Terminal 2 — Vite dev server
cd D:\MoreRepos\SomNet\SomNet.UI
npm run dev
```

Vite runs on http://localhost:56761 and proxies `/api` to port 5031.

### 4. Local video feeds (Phase 2)

With [go2rtc running](../SomNet.Edge/README.md) on the bench PC:

| File | Purpose |
|------|---------|
| `SomNet.UI/.env.development` | URLs when using `npm run dev` |
| `SomNet.UI/.env.production` | URLs baked into `dist/` for `dotnet run` / integrated build |
| `SomNet.UI/.env.example` | Template |

Default URLs (Phase 1a webcam bench — **same-origin** via API proxy in Development):

```
VITE_VIDEO_VIEWER_MODE=mse
VITE_VIDEO_FRONT_URL=/go2rtc/stream.html?src=front
VITE_VIDEO_REAR_URL=/go2rtc/stream.html?src=rear
```

(Layout A-dev — 2× USB webcam. Phase 1a single-camera bench may set both URLs to `src=front`.)

The API proxies `/go2rtc/*` → `http://localhost:1984/*` (YARP in `appsettings.Development.json`). Do **not** point iframes at `http://localhost:1984` from the SomNet UI — cross-origin embeds block autoplay on Windows (camera on/off, blank panels). Direct `http://localhost:1984/stream.html?...` in a top-level tab is fine for bench checks.

After UI changes, run **`npm run build`** in `SomNet.UI` when testing via **`dotnet run`** on the API (serves `dist/`, not the Vite dev server).

go2rtc must allow proxied WebSocket origins — in `D:\SomNet.Edge\go2rtc.yaml`:

```yaml
api:
  listen: ":1984"
  origin: "*"
```

Restart go2rtc after changing that file.

For **Layout A-dev** (2× USB), use **`src=front`** and **`src=rear`** as in `.env.example`. On poor mobile/tunnel links, set **Options → Live video feeds** to a single camera ([Phase 6 V6-D17](./19-Video-Phase-6-Tunnel-Checklist.md)).

After changing env files, rebuild UI (`npm run build`) for integrated API hosting. Omit a URL to show the placeholder for that monitor.

**Note:** go2rtc must be running before opening Manual/Automatic mode. **`VITE_VIDEO_FRONT_URL`** enables the video feature; iframe `src` values come from **session tokens** (Phase 3+) via `useSessionVideoSources`, not from these env URLs directly.

**Phase 5 (edge agent):** also run `.\SomNet.Edge\scripts\start-edge-agent.ps1` (port **5190**) so session start/end hooks reach go2rtc. Live `/go2rtc` embeds require a valid session **token** query param (API gateway middleware).

### 5. Remote operator — Cloudflare Quick Tunnel (Phase 6)

Expose the dev PC API (UI + REST + SignalR + `/go2rtc` proxy) to the internet for off-LAN smoke tests:

```powershell
# Install cloudflared once (optional — or use global install)
.\SomNet.Edge\scripts\install-cloudflared-windows.ps1

# Start Quick Tunnel (API must be running on :5031)
.\SomNet.Edge\scripts\start-cloudflare-tunnel.ps1
```

Copy the printed `https://*.trycloudflare.com` URL. URL changes each run — acceptable for dev. **Do not** expose raw go2rtc `:1984` or edge agent `:5190`.

For **named tunnel** + custom domain, use `SomNet.Edge/config/cloudflared.example.yml` (Phase 7/8). If `cloudflared` logs **`Tunnel not found`**, you are on a stale named-tunnel config — use the Quick Tunnel script instead or recreate the tunnel in Cloudflare Zero Trust.

Full checklist: [19 — Phase 6 Tunnel](./19-Video-Phase-6-Tunnel-Checklist.md).

---

## Ports and Launch Profiles

Configured in `SomNet.API/Properties/launchSettings.json`:

| Profile | URL | Notes |
|---------|-----|-------|
| `http` | http://localhost:5031 | Default development |
| `https` | https://localhost:7146 (Swagger) + **http://0.0.0.0:5031** (LAN / ESP32) | HTTPS + HTTP |

Environment: `ASPNETCORE_ENVIRONMENT=Development`

| Service | Port |
|---------|------|
| API (HTTP) | 5031 |
| API (HTTPS) | 7146 |
| Vite dev | 56761 |

---

## Build Pipeline

### Integrated build (default)

`SomNet.API.csproj` includes a pre-build target:

1. Runs `npm run build` in `../SomNet.UI`
2. Copies output to API static file serving
3. Compiles API

Single `dotnet build` or F5 produces a self-contained deployable with embedded UI.

### UI-only build

```powershell
cd D:\MoreRepos\SomNet\SomNet.UI
npm run build    # Production bundle → dist/
npm run dev      # Dev server with HMR
```

### API-only build

```powershell
cd D:\MoreRepos\SomNet\SomNet.API
dotnet build
dotnet run
```

---

## Database

### Location

```
D:\MoreRepos\SomNet\data\SomNet.mdf
```

Created automatically — no manual setup required.

### Migrations

Migrations apply on startup. To add a new migration:

```powershell
cd D:\MoreRepos\SomNet\SomNet.API
dotnet ef migrations add YourMigrationName
```

To generate SQL without applying:

```powershell
dotnet ef migrations script
```

**Design-time factory:** `Data/SomNetDbContextFactory.cs` resolves `../data/SomNet.mdf`.

### Reset database

Stop the API, delete `data/SomNet.mdf` and `data/SomNet_log.ldf`, restart — migrations and seed run fresh.

### NuGet cache issues (NU5037)

If EF or build fails with sandbox cache errors:

```powershell
$env:NUGET_PACKAGES = "$env:USERPROFILE\.nuget\packages"
dotnet ef migrations add Test
dotnet build
```

---

## Configuration

### JWT (`appsettings.Development.json`)

```json
{
  "Jwt": {
    "Key": "your-dev-key-at-least-32-characters-long",
    "Issuer": "SomNet",
    "Audience": "SomNet.UI",
    "DeviceAudience": "SomNet.Device",
    "ExpireMinutes": 480,
    "DeviceExpireDays": 365
  }
}
```

Never use development keys in production.

### Swagger

Available in Development at `/swagger`. Disabled in production.

### Static files / SPA fallback

`Program.cs` serves `SomNet.UI/dist` and falls back to `index.html` for client-side routes (future-proofing — app currently has no router).

---

## VS Code Configuration

`.vscode/launch.json` at solution root:

- **".NET Core Launch (web)"** — starts API with http profile
- Compound launch can include UI dev server

---

## Common Tasks

### Add a new API endpoint

1. Add DTO to `SomNet.Shared/DTO/`
2. Add method to `ISomNetDataStore` / `SomNetDataStore`
3. Create or extend controller in `SomNet.API/Controllers/`
4. Add fetch wrapper in `SomNet.UI/src/api/`
5. Wire into provider or component

### Add a new database entity

1. Create entity in `Data/Entities/`
2. Add DbSet to `SomNetDbContext`
3. Configure in `OnModelCreating` if needed
4. `dotnet ef migrations add EntityName`
5. Restart API (migration applies on startup)

### Add a new UI dialog

1. Create component in `components/layout/`
2. Add provider or extend existing provider for open state
3. Mount dialog in `AppShell.tsx`
4. Add header trigger button

### Test hardware flow without ESP32

1. Use Swagger to call `POST /api/devices/pair`
2. Connect a WebSocket test client to `/hubs/hardware?deviceId=...`
3. Send commands via `POST /api/devices/commands`
4. Manually invoke `AckCommand` from test client

---

## Documentation maintenance (recurring)

Keep operator and developer docs aligned with the repo **whenever behavior, API contracts, or firmware version change** — not only at release. Treat outdated docs as a defect alongside broken tests.

### When to run a doc pass

| Trigger | Minimum updates |
|---------|-----------------|
| **Feature signed off** (new checklist complete) | Checklist + [Documents/README.md](./README.md) index row + user-facing guides if operators see the change |
| **API / DTO change** | [02-API-Reference.md](./02-API-Reference.md), [07-Session-And-History.md](./07-Session-And-History.md) if sessions/history affected |
| **UI provider / gating / Options** | [03-Frontend-Architecture.md](./03-Frontend-Architecture.md), [User-Guide.md](./User-Guide.md) |
| **Firmware command or GPIO** | [06-SignalR-And-Hardware.md](./06-SignalR-And-Hardware.md), [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md), [Hardware-User-Guide.md](./Hardware-User-Guide.md), [SomNet.Device/README.md](../SomNet.Device/README.md), [SomNet.Device/docs/PROTOCOL.md](../SomNet.Device/docs/PROTOCOL.md) |
| **Bump `FIRMWARE_VERSION` in `platformio.ini`** | All “current firmware” lines (see scan below) + root [README.md](../README.md) status table |
| **Periodic hygiene** (e.g. monthly or before Phase 7+ milestones) | Full **canonical doc sweep** below |

Phase-specific checklists (09-ESP32-Phase-*, video Phase *) stay **historical** at their sign-off version; do not rewrite old bench results. Instead, update **canonical** docs and add a one-line “Post-P16 / post-…” note on older checklists when product behavior diverges (pattern in [10-UI-Session-Rehydration-Checklist.md](./10-UI-Session-Rehydration-Checklist.md)).

### Canonical documents (source of truth for “current product”)

These should describe **today’s** behavior, not a past phase:

| Doc | Must stay accurate for |
|-----|-------------------------|
| [01-System-Overview.md](./01-System-Overview.md) | Components, modes, major flows |
| [02-API-Reference.md](./02-API-Reference.md) | Routes, DTOs, `appOptions` fields |
| [03-Frontend-Architecture.md](./03-Frontend-Architecture.md) | Provider tree (`App.tsx`), dialogs, gating |
| [06-SignalR-And-Hardware.md](./06-SignalR-And-Hardware.md) | Command keys, hub events, firmware capability table |
| [07-Session-And-History.md](./07-Session-And-History.md) | Session start/end, rehydration, history |
| [User-Guide.md](./User-Guide.md) | Operator steps (header, modes, Options tabs) |
| [Hardware-User-Guide.md](./Hardware-User-Guide.md) | GPIO, pairing, firmware status line |
| [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) | Plan header + “current firmware” readiness list |
| [Documents/README.md](./README.md) | Index status column |
| [README.md](../README.md) | Quick start + status table |
| [SomNet.Device/README.md](../SomNet.Device/README.md) + [PROTOCOL.md](../SomNet.Device/docs/PROTOCOL.md) | Wire protocol and pins |

Feature checklists (e.g. [25-Session-Accessory-In-Progress-Checklist.md](./25-Session-Accessory-In-Progress-Checklist.md)) should include a **Docs / bench** section; check off canonical updates when the feature ships.

### Doc pass checklist (copy for PRs or sign-off)

- [ ] **Code truth:** Confirm claims against `App.tsx`, controllers, `HardwareCommandKeys`, `platformio.ini` (`FIRMWARE_VERSION`), `boardDefs.h`.
- [ ] **Session & hardware:** Session lifecycle matches `SessionProvider` / `SessionAccessoryProvider`; command gating matches firmware.
- [ ] **Options:** New `AppOptions` fields in `SomNet.Shared/DTO/Options/AppOptionsDto.cs`, `types/options.ts`, [02 API](./02-API-Reference.md), and User Guide / Frontend Architecture (tab: General | Notifications | Debug | Account).
- [ ] **Index:** [Documents/README.md](./README.md) row descriptions and dates where “synced YYYY-MM-DD” is used ([06](./06-SignalR-And-Hardware.md) is an example).
- [ ] **Root README:** ESP32 version and status table match `platformio.ini`.
- [ ] **No false “current” on old phases:** Phase checklist headers keep their sign-off firmware tag; only canonical docs say **`0.15.0-session-accessory`** (or whatever `platformio.ini` reads today).

### Quick stale scan (PowerShell, repo root)

Find references that often lag after a firmware bump:

```powershell
cd D:\MoreRepos\SomNet
Select-String -Path Documents\*.md,README.md,SomNet.Device\README.md -Pattern '0\.1[0-4]\.'
```

Review every hit: **historical checklist** (OK if sign-off context) vs **canonical doc** (must update).

Verify current firmware string:

```powershell
Select-String -Path SomNet.Device\platformio.ini -Pattern 'FIRMWARE_VERSION'
```

Cross-check command keys (docs vs code):

```powershell
Select-String -Path SomNet.Shared\Models\HardwareCommandKeys.cs -Pattern 'public const string'
Select-String -Path Documents\06-SignalR-And-Hardware.md -Pattern '^\| `[a-z-]+`'
```

Provider tree: diff mental model against `SomNet.UI/src/App.tsx` nesting (see [03 § Provider Tree](./03-Frontend-Architecture.md#provider-tree-authenticated)).

### Last full audit

**2026-09-21** — P16 Session in Progress, Options **Debug** tab, `DELETE /api/sessions/{id}`, firmware **`0.15.0-session-accessory`**. Tracked in [25 § Docs / bench](./25-Session-Accessory-In-Progress-Checklist.md).

Update this **Last full audit** line whenever you complete a canonical sweep.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| DLL locked on build | Stop running API process (Task Manager or `Stop-Process`) |
| Port 5031 in use | Change port in launchSettings.json or kill conflicting process |
| LocalDB not found | Install SQL Server Express LocalDB via Visual Studio Installer |
| UI changes not visible | Run `npm run build` in `SomNet.UI` or rebuild API — integrated hosting serves `dist/`, not the Vite dev server |
| 401 on all requests | Token expired — log in again; check Jwt:Key matches |
| Empty subs list | Add sub via Sub selection dialog or check DomTarget matches display name |
| Migration fails | Delete mdf and restart, or run `dotnet ef database update` |

---

## Testing

No automated test projects exist yet. Manual verification workflow:

1. Login as demo user
2. Select/add a sub
3. Choose Manual or Automatic mode
4. **Session in Progress** ON (Ready + Sub double-click ack) — then stroke/burst or automatic Start
5. Manual — stroke, burst, abort; verify history summary and session id in History
6. Automatic — start, stop; verify session record
7. Change settings (Options → Save) — reload page, confirm persistence
8. Check Swagger for API contract

After a test pass that changed product behavior, run [Documentation maintenance (recurring)](#documentation-maintenance-recurring).

---

## Git Notes

Typical untracked/generated paths (consider `.gitignore`):

- `SomNet.API/bin/`, `obj/`, `.vs/`
- `SomNet.UI/dist/`, `node_modules/`
- `data/*.mdf`, `data/*.ldf` (local database)

Source code paths to track:

- `SomNet.API/` (excluding bin/obj)
- `SomNet.Shared/`
- `SomNet.UI/src/`
- `Documents/`

---

## Production Deployment (Future)

Not yet configured. Recommended direction:

1. Azure App Service or container for API
2. Azure SQL Database (replace LocalDB connection string)
3. Azure SignalR Service (for scale-out hub)

**Local-first policy:** Develop API, UI, ESP32, and video integration on the PC (LocalDB, LAN ESP32) before Azure deployment. Camera work does not require Azure — see [Video & Camera Architecture — §15 Deployment order](./13-Video-And-Camera-Architecture.md#15-deployment-order--local-first-azure-last).
4. Key Vault for JWT signing key
5. Separate CDN for UI static assets (optional — integrated hosting works for small deployments)
