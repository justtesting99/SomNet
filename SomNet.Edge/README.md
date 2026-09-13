# SomNet Edge (video gateway)

On-premises **video edge** for SomNet — separate from `SomNet.Device` (ESP32).

**Architecture:** [Documents/13-Video-And-Camera-Architecture.md](../Documents/13-Video-And-Camera-Architecture.md)  
**Phase 1 checklist:** [Documents/14-Video-Phase-1-Edge-Bench-Checklist.md](../Documents/14-Video-Phase-1-Edge-Bench-Checklist.md)

## Role

| Component | Runs here |
|-----------|-----------|
| go2rtc (RTSP / USB → HLS) | PC (dev) → Raspberry Pi 4/5 (production) |
| Tunnel client | Same host |
| Edge agent (session hooks, token gateway) | **`SomNet.Edge.Agent`** — Phase 5 |

ESP32 does **not** handle video.

## Quick start (Phase 1 — PC bench)

### Windows (recommended)

**Install location:** `D:\SomNet.Edge` by default (saves space on C:). Override with env var `SOMNET_EDGE_HOME`.

```powershell
# From repo root — one-time install to D:\SomNet.Edge\bin
.\SomNet.Edge\scripts\install-go2rtc-windows.ps1

# List USB cameras (DirectShow index for front stream)
.\SomNet.Edge\scripts\list-camera-devices.ps1

# Edit local config — never commit credentials
notepad D:\SomNet.Edge\go2rtc.yaml

# Start gateway (stop first if ports in use)
.\SomNet.Edge\scripts\stop-go2rtc-windows.ps1
.\SomNet.Edge\scripts\start-go2rtc-windows.ps1
```

**Remove old C: install (if created earlier):** delete `%LOCALAPPDATA%\SomNet.Edge` after confirming D: works.

### Layout A-dev (active — 2× USB webcam)

**All remaining video development** uses two USB webcams (V1-D10). **IP cameras on hold** (V1-D9).

1. Run `list-camera-devices.ps1` — note DirectShow names for front and rear.
2. Configure **`front`** and **`rear`** in `go2rtc.yaml` — use `exec` libx264 on Windows if WebRTC shows MP4V-ES errors (see `config/go2rtc.yaml.example`).
3. Open `http://localhost:1984/stream.html?src=front` and `src=rear` — confirm **distinct** feeds.
4. Set `VITE_VIDEO_FRONT_URL` / `VITE_VIDEO_REAR_URL` in UI env; rebuild for SomNet dashboard embed.

**Production target (V1-D11):** Raspberry Pi 4/5 + 2× USB webcam — validate dual V4L2 soak in [Phase 7](../Documents/20-Video-Phase-7-Pi-Production-Checklist.md). No vendor cloud; outbound video only via SomNet session tunnel.

### Phase 1b (IP camera) — **on hold** (V1-D9)

Stock Wansview app and Thingino G7 flash both failed on bench hardware. Do **not** block Phases 3–8.

**When resumed:** [Phase 1c G7 flash](../Documents/14-Video-Phase-1c-Thingino-G7-Flash-Checklist.md) → [Phase 1b G7 setup](../Documents/14-Video-Phase-1b-Galayou-G7-Setup.md). G2 fleet: [G2 flash](../Documents/14-Video-Phase-1c-Thingino-G2-Flash-Checklist.md).

## Supported camera layouts

| Layout | Front | Rear | Status |
|--------|-------|------|--------|
| **A-dev** | USB webcam | USB webcam | **Active** — dev + preferred interim production |
| **A** | USB webcam | IP camera (RTSP) | On hold |
| **B** | IP camera | IP camera | On hold |

Use **1080p H.264** for live; **2K** frame grab for action stills (later phases).

## Phase 5 — edge agent

```powershell
# After go2rtc is running:
.\SomNet.Edge\scripts\start-edge-agent.ps1
```

Listens on **http://localhost:5190**. SomNet API notifies the agent on session start/end (`Video:Edge` in `appsettings.Development.json`). Token validation for live feeds runs in the API `/go2rtc` proxy middleware (dev bench).

See [Phase 5 checklist](../Documents/18-Video-Phase-5-Edge-Agent-Checklist.md).

## Phase 6 — Cloudflare Tunnel (remote operator)

Expose the dev PC SomNet stack over HTTPS for remote operators. Tunnel **SomNet API only** (`5031`) — UI, SignalR, and `/go2rtc` token gateway. Do **not** expose go2rtc `:1984` or edge agent `:5190`.

See [Phase 6 checklist](../Documents/19-Video-Phase-6-Tunnel-Checklist.md).

### One-time install

```powershell
# From repo root — installs to D:\SomNet.Edge\bin (or SOMNET_EDGE_HOME)
.\SomNet.Edge\scripts\install-cloudflared-windows.ps1
```

Or install `cloudflared` globally and ensure it is on `PATH`.

### Dev startup (four terminals)

```powershell
# Terminal 1 — go2rtc
.\SomNet.Edge\scripts\start-go2rtc-windows.ps1

# Terminal 2 — edge agent
.\SomNet.Edge\scripts\start-edge-agent.ps1

# Terminal 3 — API (serves UI dist)
dotnet run --project SomNet.API

# Terminal 4 — Cloudflare Quick Tunnel
.\SomNet.Edge\scripts\start-cloudflare-tunnel.ps1
```

Copy the **`https://….trycloudflare.com`** URL printed by the tunnel script. Remote operators use that URL — not `localhost`. The URL **changes each run** (Quick Tunnel); custom domain + named tunnel → [Phase 7](../Documents/20-Video-Phase-7-Pi-Production-Checklist.md) / [Phase 8](../Documents/21-Video-Phase-8-Azure-Cutover-Checklist.md).

| Setting | Phase 6 value |
|---------|----------------|
| Pairing `video.tunnelBaseUrl` | **Empty** — same-origin `/go2rtc` through tunneled API |
| ESP32 `server_url` | **LAN API** (e.g. `http://192.168.x.x:5031`) — not the tunnel URL |
| Viewer mode | **`mse`** (`VITE_VIDEO_VIEWER_MODE=mse`) |

**Named tunnel template (later):** copy [`config/cloudflared.example.yml`](config/cloudflared.example.yml) to `D:\SomNet.Edge\cloudflared.yml` and add dashboard credentials locally.

## Folder layout

```
SomNet.Edge/
  README.md
  config/
    go2rtc.yaml.example       # Template — copy locally
    cloudflared.example.yml   # Named tunnel template (Phase 7/8)
  embed/                      # Custom iframe pages (Phase 2+)
  scripts/
    install-cloudflared-windows.ps1
    start-cloudflare-tunnel.ps1  # Phase 6 Quick Tunnel
    start-edge-agent.ps1         # Phase 5 edge agent

SomNet.Edge.Agent/        # Phase 5 — session lifecycle service
```

## Local-first

No Azure required until [Phase 8](../Documents/21-Video-Phase-8-Azure-Cutover-Checklist.md).
