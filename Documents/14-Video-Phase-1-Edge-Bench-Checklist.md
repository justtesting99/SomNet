# Video — Phase 1 Edge bench (go2rtc on PC)

**Status:** **Partial sign-off (Layout A-dev + Phase 2)** — 2026-09-11; **IP cameras on hold**

> **Active path (V1-D10 + V1-D11):** **2× USB webcams** for all remaining video dev — front + rear distinct feeds ([§4.4 Layout A-dev](#44-stream-mapping)). Verified on PC: **HD User Facing** + **Anker PowerConf C200**.
>
> **IP cameras on hold (V1-D9):** Galayou G2/G7 — stock Wansview app unusable; Thingino flash failed. Do **not** block Phases 3–8. Resume [1b/1c](./14-Video-Phase-1c-Thingino-G7-Flash-Checklist.md) only if/until a provisioning path works.

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
| **Camera layout** | **Layout A-dev** (2× USB webcam) — active; Layout A/B + IP **on hold** |
| **Live protocol** | HLS / MSE from go2rtc |
| **Blocks** | IP-camera full sign-off on hold; **Phases 3–8 active** with dual webcam |

---

## 1. Problem statement

SomNet UI has **VideoFeed** placeholders but no live sources. Before API tokens or Azure, prove the **edge pipeline** on the bench: cameras → go2rtc → browser-playable HLS.

---

## 2. Locked decisions

| ID | Decision | Choice | Date |
|----|----------|--------|------|
| **V1-D1** | Gateway software | **go2rtc** | 2026-09-11 |
| **V1-D2** | Dev host | **PC** (not Pi) | 2026-09-11 |
| **V1-D3** | Camera layout | **A-dev** 2× USB (active); **A** webcam+IP / **B** 2× IP on hold | 2026-09-11 |
| **V1-D4** | Live resolution | **1080p H.264** substream for IP; **720p–1080p** for webcam | 2026-09-11 |
| **V1-D5** | Azure / SomNet API | **Not used** this phase | 2026-09-11 |
| **V1-D6** | Sample config location | **`SomNet.Edge/`** in repo | 2026-09-11 |
| **V1-D7** | IP camera internet egress | **Block vendor cloud** after setup; **LAN RTSP → edge only** (Blue Iris–style) | 2026-09-11 |
| **V1-D8** | IP camera firmware | **Thingino** (production intent); bench path **paused** — see **V1-D9** | 2026-09-11 |
| **V1-D9** | IP cameras (Galayou) | **On hold** — stock app dead; Thingino G7 flash failed; not blocking dev | 2026-09-11 |
| **V1-D10** | Active camera layout | **Layout A-dev** — 2× USB webcam for all remaining video phases | 2026-09-11 |
| **V1-D11** | Production edge (while IP on hold) | **Pi 4/5 + 2× USB webcam** preferred if soak proves capacity — no vendor cloud egress; egress only via SomNet tunnel + session tokens | 2026-09-11 |

---

## 3. Prerequisites

### Environment

- [x] **2× USB webcams** on dev PC *(Layout A-dev — active)*
- [ ] ~~IP camera~~ — **on hold** (V1-D9); resume Phase 1b when unblocked
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

### 4.1 IP camera sanity *(on hold — skip until V1-D9 unblocked)*

- [ ] ~~Ping / RTSP / VLC~~ — see [Phase 1b G7](./14-Video-Phase-1b-Galayou-G7-Setup.md) when resumed

### 4.2 Webcam sanity *(Layout A only — Phase 1a)*

- [x] Webcam recognized by OS — **HD User Facing** (DirectShow index 0)
- [x] Optional: test in Camera app / `ffmpeg -list_devices` — `list-camera-devices.ps1`

### 4.3 go2rtc install

- [x] Install go2rtc on PC — `SomNet.Edge/scripts/install-go2rtc-windows.ps1` or manual download
- [x] Enable HLS in config (`api` + `hls` listeners per example)
- [x] Define streams `front` and `rear` in `go2rtc.yaml` — **Layout A-dev:** two `exec` libx264 devices
- [x] Start go2rtc — `SomNet.Edge/scripts/start-go2rtc-windows.ps1`; web UI `http://localhost:1984`

### 4.4 Stream mapping

**Layout A — webcam front + IP rear** *(production; 1b deferred):*

- [x] `front` → USB device — **operator confirms picture (2026-09-11)**
- [ ] `rear` → RTSP URL — when IP camera path unblocks

**Layout A-dev — two USB webcams** *(active — V1-D10):*

- [x] Run `list-camera-devices.ps1` — **`[0]` HD User Facing**, **`[1]` Anker PowerConf C200**
- [x] `front` → first webcam; `rear` → second (`exec:` libx264 in `D:\SomNet.Edge\go2rtc.yaml`)
- [x] `VITE_VIDEO_REAR_URL=...src=rear` (not `src=front`)
- [x] Browser + SomNet dashboard: **different** front/rear pictures

**Layout B — two IP cameras:**

- [ ] `front` → RTSP URL (face/expression mount)
- [ ] `rear` → RTSP URL (tool result mount)

### 4.5 HLS verification

- [x] Browser: `http://localhost:1984/stream.html?src=front` plays **webcam** video — **V1-T1 pass (2026-09-11)**
- [x] Browser: `http://localhost:1984/stream.html?src=rear` plays video — **V1-T2 pass** (A-dev: distinct rear)
- [ ] Both streams play **simultaneously** in two tabs for ≥2 minutes
- [ ] Observe delay (~3–10 s HLS) — acceptable per architecture
- [ ] **Phase 1b:** replace rear with IP RTSP; rear shows real camera (required for sign-off)

### 4.6 Repo artifacts

- [x] `SomNet.Edge/scripts/` — install, start, stop, list-camera-devices, edge-home
- [x] Update `SomNet.Edge/config/go2rtc.yaml.example` — Windows defaults (no forced size/fps)
- [x] Document chosen layout and stream paths in Phase 1 bench notes (§8)
- [ ] Optional: minimal custom embed page in `SomNet.Edge/embed/` (black chrome-free) for Phase 2

### 4.7 Docs

- [x] Update [14-Video-Implementation-Plan.md](./14-Video-Implementation-Plan.md) — Phase 1 status
- [ ] Update [Documents/README.md](./README.md) index when signed off

---

## 5. Smoke tests

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **V1-T1** | Start go2rtc; open front HLS viewer | Front video visible; no constant stall/rebuffer | ☑ **2026-09-11** |
| **V1-T2** | Open rear HLS viewer | Rear video visible (distinct from front — A-dev) | ☑ **2026-09-11** |
| **V1-T3** | Both streams open ≥10 min | No go2rtc crash; CPU acceptable on PC | ☐ |
| **V1-T4** | Stop rear RTSP (disconnect cam or bad URL) | Front still works; rear fails gracefully | ☐ |
| **V1-T5** | Restart go2rtc | Streams recover within 30 s | ☐ |
| **V1-T6** | Record layout + resolutions used | Bench notes §8 filled (Layout A or B, 720p/1080p) | ☐ |

---

## 6. Exit criteria (sign-off)

### Partial sign-off *(current — V1-D9)*

**Signed off for Phases 3–8 dev** when:

1. **V1-T1–T2** pass (front live; rear live — **distinct** feeds, Layout A-dev).
2. [Phase 2 UI embed](./15-Video-Phase-2-UI-Embed-Checklist.md) complete.
3. Layout **A-dev** documented (2× USB webcam); IP layouts **on hold**.

**Then:** Start [Phase 3 — Session tokens](./16-Video-Phase-3-Session-Tokens-Checklist.md). Token logic applies to **both** feeds (A-dev: distinct front + rear).

### Full sign-off *(when IP rear available)*

Phase 1 **fully** signed off when:

1. **V1-T1–T6** pass — including **V1-T5** real IP camera on `rear` (not mirror).
2. Layout documented; `SomNet.Edge/` example updated (no credentials committed).
3. [Phase 1b](./14-Video-Phase-1b-Galayou-G7-Setup.md) complete.

---

## 7. Architecture (this phase)

```text
[USB webcam front] ──► go2rtc "front" ──► MSE ──► browser / SomNet UI
[USB webcam rear]  ──► go2rtc "rear"  ──► MSE ──► browser / SomNet UI
                              ▲
                    Dev PC now; Pi 4 target (V1-D11)
```

No tunnel, no SomNet, no Azure.

---

## 8. Bench notes

| Field | Value |
|-------|-------|
| Date | 2026-09-11 (Phase 1a started) |
| PC OS | Windows |
| go2rtc version | v1.9.14 |
| Layout | **A-dev** (2× USB webcam) — IP on hold |
| Front source | `exec` dshow **HD User Facing** → libx264 |
| Rear source | `exec` dshow **Anker PowerConf C200** → libx264 |
| Live resolution (front / rear) | Native ~720p @ 30 fps; distinct feeds |
| Local config | `D:\SomNet.Edge\go2rtc.yaml` |
| Notes | V1-T1 pass; forced 1280x720@15 fails on this camera; D: install; stop script before restart |

### Phase 1a vs 1b

| Milestone | Hardware | Pass |
|-----------|----------|------|
| **1a** | Webcam front | ☑ pass |
| **A-dev** *(active)* | 2× USB webcam front + rear | ☑ pass — browser + SomNet UI |
| **1b / 1c** *(on hold)* | IP / Thingino | Paused (V1-D9) — [G7](./14-Video-Phase-1c-Thingino-G7-Flash-Checklist.md) · [G2](./14-Video-Phase-1c-Thingino-G2-Flash-Checklist.md) |
| **Pi 4 A-dev** *(next hardware)* | Move 2× USB to Pi edge | Phase 7 — validate V1-D11 |

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
| `Output file does not contain any stream` on rear | Wrong device index or front not running | Run `list-camera-devices.ps1`; fix rear device name/index |
| Installed on C: by mistake | Earlier script used `%LOCALAPPDATA%` | Use **D:\SomNet.Edge**; delete old `%LOCALAPPDATA%\SomNet.Edge` |

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial Phase 1 checklist |
| 2026-09-11 | D: install path; Windows rear = restream front; troubleshooting §9 |
| 2026-09-11 | **V1-T1 pass** — HD User Facing front feed in browser |
| 2026-09-11 | **V1-T2 pass** — rear mirrors front (Phase 1a) |
| 2026-09-11 | **Checkpoint** — 1b/sign-off blocked pending Phase 1c Thingino G2 flash |
| 2026-09-11 | **Pivot to G7** — 1c G7 active; G2 deferred; stock app abandoned |
| 2026-09-11 | **V1-D9** — IP camera deferred; partial sign-off; Phases 3–8 unblocked (rear mirrors front) |
| 2026-09-11 | **V1-D10** — Layout A-dev: 2× USB webcam bench alternative |
| 2026-09-11 | **A-dev verified** — HD User Facing + Anker; IP on hold; V1-D11 Pi target |
