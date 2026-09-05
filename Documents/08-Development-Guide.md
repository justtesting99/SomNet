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

---

## Ports and Launch Profiles

Configured in `SomNet.API/Properties/launchSettings.json`:

| Profile | URL | Notes |
|---------|-----|-------|
| `http` | http://localhost:5031 | Default development |
| `https` | https://localhost:7146 + http://5031 | HTTPS + HTTP |

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

## Troubleshooting

| Issue | Solution |
|-------|----------|
| DLL locked on build | Stop running API process (Task Manager or `Stop-Process`) |
| Port 5031 in use | Change port in launchSettings.json or kill conflicting process |
| LocalDB not found | Install SQL Server Express LocalDB via Visual Studio Installer |
| UI changes not visible | Run `npm run build` in UI or rebuild API (integrated build) |
| 401 on all requests | Token expired — log in again; check Jwt:Key matches |
| Empty subs list | Add sub via Sub selection dialog or check DomTarget matches display name |
| Migration fails | Delete mdf and restart, or run `dotnet ef database update` |

---

## Testing

No automated test projects exist yet. Manual verification workflow:

1. Login as demo user
2. Select/add a sub
3. Manual mode — stroke, burst, abort; verify history summary
4. Automatic mode — start, stop; verify session record
5. Change settings — reload page, confirm persistence
6. Check Swagger for API contract

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
4. Key Vault for JWT signing key
5. Separate CDN for UI static assets (optional — integrated hosting works for small deployments)
