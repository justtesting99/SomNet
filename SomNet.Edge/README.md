# SomNet Edge (video gateway)

On-premises **video edge** for SomNet — separate from `SomNet.Device` (ESP32).

**Architecture:** [Documents/13-Video-And-Camera-Architecture.md](../Documents/13-Video-And-Camera-Architecture.md)  
**Phase 1 checklist:** [Documents/14-Video-Phase-1-Edge-Bench-Checklist.md](../Documents/14-Video-Phase-1-Edge-Bench-Checklist.md)

## Role

| Component | Runs here |
|-----------|-----------|
| go2rtc (RTSP / USB → HLS) | PC (dev) → Raspberry Pi 4/5 (production) |
| Tunnel client | Same host |
| Edge agent (session hooks, snapshots) | Phase 5+ |

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

### Phase 1a (webcam first)

1. Configure **`front`** only with USB webcam (`video=0`).
2. On **Windows**, **`rear`** restreams **`front`** until IP camera RTSP is configured (do not use Linux `lavfi` test patterns).
3. Open `http://localhost:1984/stream.html?src=front` — confirm webcam picture.
4. Open `src=rear` — should mirror front until Phase 1b IP camera is added.

### Phase 1b (IP camera)

1. Test RTSP in VLC.
2. Replace `rear` in `%LOCALAPPDATA%\SomNet.Edge\go2rtc.yaml` with RTSP URL.
3. Restart go2rtc; confirm real rear feed — required for Phase 1 sign-off.

## Supported camera layouts

| Layout | Front | Rear |
|--------|-------|------|
| **A** *(default)* | USB webcam | IP camera (RTSP) |
| **B** | IP camera | IP camera |

Use **1080p H.264** for live; **2K** frame grab for action stills (later phases).

## Folder layout

```
SomNet.Edge/
  README.md
  config/
    go2rtc.yaml.example   # Template — copy locally
  embed/                  # Custom iframe pages (Phase 2+)
```

## Local-first

No Azure required until [Phase 8](../Documents/21-Video-Phase-8-Azure-Cutover-Checklist.md).
