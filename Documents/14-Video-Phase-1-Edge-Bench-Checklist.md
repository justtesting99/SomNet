# Video — Phase 1 Edge bench (go2rtc on PC)

**Status:** **In progress** — Phase 1a **front pass** (2026-09-11); Phase 1b IP rear + full sign-off pending

| Related | Link |
|---------|------|
| Architecture (source of truth) | [13-Video-And-Camera-Architecture.md](./13-Video-And-Camera-Architecture.md) |
| Phase roadmap | [14-Video-Implementation-Plan.md](./14-Video-Implementation-Plan.md) |
| Local dev / no Azure | [13 §15](./13-Video-And-Camera-Architecture.md#15-deployment-order--local-first-azure-last) · [08-Development-Guide.md](./08-Development-Guide.md) |
| Hardware site setup | [13 §8](./13-Video-And-Camera-Architecture.md#8-edge-hardware--camera-choices) · [Hardware User Guide](./Hardware-User-Guide.md) |

**Goal:** On a **development PC**, run **go2rtc** with **front + rear** camera sources and confirm **HLS** plays in a browser for both feeds. No SomNet API/UI changes required for this phase.

**Target output:** Documented bench setup; `SomNet.Edge/` sample config; both streams stable at 1080p (or 720p webcam) for ≥10 minutes.

**Explicitly out of scope (Phase 1):** SomNet iframe embed; session tokens; tunnel; edge agent; snapshots to storage; ESP32 integration; Raspberry Pi production image; Azure.

---

## Phase 1 at a glance

| Item | Value |
|------|--------|
| **Host** | Windows or Linux **PC** (Pi not required) |
| **Gateway software** | [go2rtc](https://github.com/AlexxIT/go2rtc) |
| **Camera layout** | **Layout A** (webcam + IP) *or* **Layout B** (2× IP) — record which |
| **Live protocol** | HLS from go2rtc |
| **Blocks** | Phase 2 (UI embed) until exit criteria met |

---

## 1. Problem statement

SomNet UI has **VideoFeed** placeholders but no live sources. Before API tokens or Azure, prove the **edge pipeline** on the bench: cameras → go2rtc → browser-playable HLS.

---

## 2. Locked decisions

| ID | Decision | Choice | Date |
|----|----------|--------|------|
| **V1-D1** | Gateway software | **go2rtc** | 2026-09-11 |
| **V1-D2** | Dev host | **PC** (not Pi) | 2026-09-11 |
| **V1-D3** | Camera layout | **A** webcam+IP / **B** 2× IP — record in §8 on sign-off | 2026-09-11 |
| **V1-D4** | Live resolution | **1080p H.264** substream for IP; **720p–1080p** for webcam | 2026-09-11 |
| **V1-D5** | Azure / SomNet API | **Not used** this phase | 2026-09-11 |
| **V1-D6** | Sample config location | **`SomNet.Edge/`** in repo | 2026-09-11 |

---

## 3. Prerequisites

### Environment

- [ ] Development PC on same LAN as IP camera(s) *(required for Phase 1b rear)*
- [ ] USB webcam available *(Layout A)* or second IP camera *(Layout B)*
- [ ] IP camera RTSP URL and credentials known (test in VLC first) — **Phase 1b**
- [x] go2rtc release for OS installed or runnable — v1.9.14 → **`D:\SomNet.Edge\bin`** (override: `SOMNET_EDGE_HOME`)
- [ ] VLC or ffplay for RTSP sanity check — **Phase 1b**

### Optional

- [x] SomNet API **not required** — may run later for unrelated work
- [x] ESP32 **not required** — Phase 7 integrates commands + video

### Repo

- [x] Review [SomNet.Edge/README.md](../SomNet.Edge/README.md)
- [x] Local config at **`D:\SomNet.Edge\go2rtc.yaml`** (from example; not committed)

---

## 4. Implementation checklist

### 4.1 IP camera sanity (rear, or both for Layout B)

- [ ] Ping / open camera web UI on LAN
- [ ] Confirm **H.264** stream available (prefer **1080p substream** for 2K cameras)
- [ ] VLC: `rtsp://user:pass@camera-ip:554/...` plays
- [ ] Record RTSP URL(s) in local notes (do **not** commit credentials)

### 4.2 Webcam sanity *(Layout A only — Phase 1a)*

- [x] Webcam recognized by OS — **HD User Facing** (DirectShow index 0)
- [x] Optional: test in Camera app / `ffmpeg -list_devices` — `list-camera-devices.ps1`

### 4.3 go2rtc install

- [x] Install go2rtc on PC — `SomNet.Edge/scripts/install-go2rtc-windows.ps1` or manual download
- [x] Enable HLS in config (`api` + `hls` listeners per example)
- [x] Define streams `front` and `rear` in `go2rtc.yaml` (rear = **restream front** on Windows until IP camera)
- [x] Start go2rtc — `SomNet.Edge/scripts/start-go2rtc-windows.ps1`; web UI `http://localhost:1984`

### 4.4 Stream mapping

**Layout A — webcam front + IP rear:**

- [x] `front` → USB device (`ffmpeg:device?video=0#video=h264`) — **operator confirms picture (2026-09-11)**
- [ ] `rear` → RTSP URL — **Phase 1b** (restream front active for Phase 1a)

**Layout B — two IP cameras:**

- [ ] `front` → RTSP URL (face/expression mount)
- [ ] `rear` → RTSP URL (tool result mount)

### 4.5 HLS verification

- [x] Browser: `http://localhost:1984/stream.html?src=front` plays **webcam** video — **V1-T1 pass (2026-09-11)**
- [x] Browser: `http://localhost:1984/stream.html?src=rear` plays video (mirrors front) — **V1-T2 pass (2026-09-11)**
- [ ] Both streams play **simultaneously** in two tabs for ≥2 minutes
- [ ] Observe delay (~3–10 s HLS) — acceptable per architecture
- [ ] **Phase 1b:** replace rear with IP RTSP; rear shows real camera (required for sign-off)

### 4.6 Repo artifacts

- [x] `SomNet.Edge/scripts/` — install, start, stop, list-camera-devices, edge-home
- [x] Update `SomNet.Edge/config/go2rtc.yaml.example` — Windows defaults (no forced size/fps)
- [x] Document chosen layout and stream paths in Phase 1 bench notes (§8)
- [ ] Optional: minimal custom embed page in `SomNet.Edge/embed/` (black chrome-free) for Phase 2

### 4.7 Docs

- [ ] Update [14-Video-Implementation-Plan.md](./14-Video-Implementation-Plan.md) — Phase 1 status
- [ ] Update [Documents/README.md](./README.md) index when signed off

---

## 5. Smoke tests

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **V1-T1** | Start go2rtc; open front HLS viewer | Front video visible; no constant stall/rebuffer | ☑ **2026-09-11** |
| **V1-T2** | Open rear HLS viewer | Rear video visible | ☑ **2026-09-11** (mirrors front) |
| **V1-T3** | Both streams open ≥10 min | No go2rtc crash; CPU acceptable on PC | ☐ |
| **V1-T4** | Stop rear RTSP (disconnect cam or bad URL) | Front still works; rear fails gracefully | ☐ |
| **V1-T5** | Restart go2rtc | Streams recover within 30 s | ☐ |
| **V1-T6** | Record layout + resolutions used | Bench notes §8 filled (Layout A or B, 720p/1080p) | ☐ |

---

## 6. Exit criteria (sign-off)

Phase 1 is **signed off** when:

1. **V1-T1–T6** pass on the dev PC.
2. Layout **A or B** documented with stream names `front` / `rear`.
3. `SomNet.Edge/` example config matches bench (no credentials committed).
4. Operator can open two browser tabs with live HLS for front and rear.

**Then:** Start [15-Video-Phase-2-UI-Embed-Checklist.md](./15-Video-Phase-2-UI-Embed-Checklist.md) (SomNet dashboard iframes).

---

## 7. Architecture (this phase)

```text
[Webcam or IP front] ──► go2rtc stream "front" ──► HLS ──► browser tab
[IP rear]            ──► go2rtc stream "rear"  ──► HLS ──► browser tab
                              ▲
                         Dev PC (local only)
```

No tunnel, no SomNet, no Azure.

---

## 8. Bench notes

| Field | Value |
|-------|-------|
| Date | 2026-09-11 (Phase 1a started) |
| PC OS | Windows |
| go2rtc version | v1.9.14 |
| Layout | **A** (webcam front; IP rear pending) |
| Front source | `ffmpeg:device?video=0#video=h264` — device **HD User Facing** |
| Rear source | **Restream** `rtsp://127.0.0.1:8554/front` until IP RTSP Phase 1b |
| Live resolution (front / rear) | Native ~1280x720 @ 30 fps (no forced size/fps); rear mirrors front |
| Local config | `D:\SomNet.Edge\go2rtc.yaml` |
| Notes | V1-T1 pass; forced 1280x720@15 fails on this camera; D: install; stop script before restart |

### Phase 1a vs 1b

| Milestone | Hardware | Pass |
|-----------|----------|------|
| **1a** *(now)* | Webcam only (+ rear mirrors front on Windows) | ☑ **V1-T1 pass** — front live; pipeline proven |
| **1b** *(when IP cam available)* | Webcam + IP rear RTSP | V1-T2 rear live; **full Phase 1 sign-off** |

---

## 9. Troubleshooting (Windows)

| Symptom | Cause | Fix |
|---------|-------|-----|
| **`Could not set video options`** / I/O on **HD User Facing** | Forced `video_size` / `framerate` not supported | Use `ffmpeg:device?video=0#video=h264` only (no size/fps in yaml) |
| **WebRTC `MP4V-ES` codec not matched** | Camera not outputting H264 | Use `exec:` ffmpeg **libx264** in go2rtc.yaml |
| **Blank stream.html, camera on/off, no errors** | `mode=hls` only on Chrome/Edge | Use `mode=mse` or `mode=webrtc,mse` (not hls alone on Windows) |
| **`Could not find video device with name ["HD]`** / `video="HD.` | Wrong dshow quoting in `exec:` line | Use `-i "video=HD User Facing"` (quotes around whole input), not `video="HD User Facing"` |
| **`websocket: request origin not allowed`** | UI/proxy Origin ≠ go2rtc Host (:1984) | Add `api.origin: "*"` in go2rtc.yaml; restart go2rtc |
| `Error opening output file 0` / mjpeg decode errors on **front** | Wrong device index or camera in use | Run `list-camera-devices.ps1`; close Zoom/Teams/Camera app |
| **`bind: Only one usage of each socket address`** | go2rtc already running (duplicate start) | `.\SomNet.Edge\scripts\stop-go2rtc-windows.ps1` or close other PowerShell window |
| HLS errors on **rear** with `lavfi` / `testsrc` | Linux-only test source on **go2rtc win32** build | Use `rtsp://127.0.0.1:8554/front` for Phase 1a |
| `Output file does not contain any stream` on rear | Front not running — rear mirrors front | Fix front first |
| Installed on C: by mistake | Earlier script used `%LOCALAPPDATA%` | Use **D:\SomNet.Edge**; delete old `%LOCALAPPDATA%\SomNet.Edge` |

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial Phase 1 checklist |
| 2026-09-11 | D: install path; Windows rear = restream front; troubleshooting §9 |
| 2026-09-11 | **V1-T1 pass** — HD User Facing front feed in browser |
| 2026-09-11 | **V1-T2 pass** — rear mirrors front (Phase 1a) |
