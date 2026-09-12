# Video — Phase 2 UI embed (dashboard iframes)

**Status:** **Complete** — V2-T1–T4 pass (2026-09-11); **Layout A-dev** — distinct front + rear USB webcams verified in browser and SomNet UI

> **Note:** UI embed and `/go2rtc` proxy are done. **Active path:** 2× USB webcam (V1-D10). **IP cameras on hold** (V1-D9). **Phase 3+ unblocked.**

| Related | Link |
|---------|------|
| Architecture | [13-Video-And-Camera-Architecture.md](./13-Video-And-Camera-Architecture.md) |
| Frontend video components | [03-Frontend-Architecture.md](./03-Frontend-Architecture.md) — Video Components |
| Plan | [14-Video-Implementation-Plan.md](./14-Video-Implementation-Plan.md) |
| Phase 1 | [14-Video-Phase-1-Edge-Bench-Checklist.md](./14-Video-Phase-1-Edge-Bench-Checklist.md) — 1a pass |

**Goal:** Show **live front + rear** HLS feeds inside the SomNet dashboard (`DashboardLayout` / `VideoFeed` iframes) using **dev LAN URLs** from go2rtc (no session tokens yet).

**Explicitly out of scope:** Session-scoped tokens; tunnel; snapshots; pairing settings API.

---

## Locked decisions

| ID | Decision | Choice | Date |
|----|----------|--------|------|
| **V2-D1** | URL source v1 | `VITE_VIDEO_FRONT_URL` / `VITE_VIDEO_REAR_URL` (Phase 3+: feature gate only; tokens supply iframe `src`) | 2026-09-11 |
| **V2-D2** | Feed mapping | Monitor 1 = **Front**, Monitor 2 = **Rear** | 2026-09-11 |
| **V2-D3** | Auth | None on iframe URL (LAN bench); tokens in Phase 3 | 2026-09-11 |
| **V2-D4** | CSP / mixed content | localhost SomNet + localhost go2rtc for v1 | 2026-09-11 |

---

## Implementation checklist

### UI

- [x] `config/videoSources.ts` — `getDashboardVideoSources()`
- [x] Pass `videoSources` into `DashboardLayout` from `App.tsx` (manual + automatic)
- [x] `.env.development` / `.env.production` / `.env.example` with go2rtc viewer URLs
- [x] Dashboard labels **Front** / **Rear**
- [x] Placeholder when URL unset (existing `VideoFeed` behavior)
- [x] Unit test — `videoSources.test.ts`

### Docs

- [x] [03-Frontend-Architecture.md](./03-Frontend-Architecture.md) — videoSources wiring
- [x] [08-Development-Guide.md](./08-Development-Guide.md) — env vars for local video

---

## Smoke tests

**Prerequisites:** go2rtc running (`start-go2rtc-windows.ps1`); UI rebuilt if using integrated API.

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **V2-T1** | Manual mode; both env URLs set | Front + rear play in dashboard monitors | ☑ |
| **V2-T2** | Mobile viewport | Feeds visible; expand overlay works | ☑ |
| **V2-T3** | Unset rear URL | Front plays; rear shows placeholder | ☑ |
| **V2-T4** | Stroke command (ESP32 optional) | Video unaffected; controls work | ☑ |

---

## Exit criteria

**V2-T1–T4** pass → start [Phase 3](./16-Video-Phase-3-Session-Tokens-Checklist.md).

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial stub |
| 2026-09-11 | Implementation — env URLs, App wiring, Front/Rear labels |
| 2026-09-11 | Fix — viewer mode + defer rear iframe (Windows DirectShow race) |
| 2026-09-11 | Perf — Phase 1a both panels `src=front`; exec libx264 for WebRTC compatibility |
| 2026-09-11 | Fix — MP4V-ES/WebRTC mismatch → exec libx264 transcode in go2rtc.yaml |
| 2026-09-11 | Fix — blank page on `mode=hls` in Chrome → default viewer `mse` |
| 2026-09-11 | Fix — iframe embed blank/camera flash → same-origin `/go2rtc` API proxy (YARP) |
| 2026-09-11 | Fix — go2rtc `api.origin: "*"` for proxied WebSocket |
| 2026-09-11 | **V2-T1–T4 pass** — Phase 2 sign-off |
| 2026-09-11 | V1-D9 — IP camera on hold |
| 2026-09-11 | **A-dev verified** — distinct front/rear feeds; Phase 3+ unblocked |
