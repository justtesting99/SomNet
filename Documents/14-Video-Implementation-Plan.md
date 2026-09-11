# Video Implementation Plan

**Status:** Phase 1 **partial sign-off** — **Layout A-dev** (2× USB webcam) + Phase 2 pass; **IP on hold** (V1-D9); **Phase 3+ active**  
**Architecture (source of truth):** [13-Video-And-Camera-Architecture.md](./13-Video-And-Camera-Architecture.md)

Video work is **separate from ESP32 firmware phases** and **separate from UI rehydration / multi-tab checklists**. Develop on **local PC + LocalDB** until Phase 8; **no Azure hosting required** until then ([13 §15](./13-Video-And-Camera-Architecture.md#15-deployment-order--local-first-azure-last)).

---

## Phase summary

| Phase | Checklist | Goal | Host | SomNet code? |
|-------|-----------|------|------|--------------|
| **1** | [Phase 1 — Edge bench](./14-Video-Phase-1-Edge-Bench-Checklist.md) | go2rtc + 2× USB webcam (A-dev) | **PC** | No — **partial sign-off** |
| **1c** | [Phase 1c — Thingino G7 flash](./14-Video-Phase-1c-Thingino-G7-Flash-Checklist.md) | IP rear (Galayou) | PC | No — **on hold** (V1-D9) |
| **1c′** | [Phase 1c — Thingino G2 flash](./14-Video-Phase-1c-Thingino-G2-Flash-Checklist.md) | IP fleet | PC | No — **on hold** |
| **2** | [Phase 2 — UI embed](./15-Video-Phase-2-UI-Embed-Checklist.md) | `VideoFeed` iframes in dashboard (LAN URLs) | PC | UI — **complete** |
| **3** | [Phase 3 — Session tokens](./16-Video-Phase-3-Session-Tokens-Checklist.md) | API mints session-scoped stream tokens; UI fetches on session start | PC + local API | API + UI — **next** |
| **4** | [Phase 4 — Action snapshots](./17-Video-Phase-4-Action-Snapshots-Checklist.md) | Capture on device ack; local disk or Azurite; link to session events | PC + local API | API + edge script |
| **5** | [Phase 5 — Edge agent](./18-Video-Phase-5-Edge-Agent-Checklist.md) | Session start/end → enable streams; token validation at gateway | PC | API + edge agent |
| **6** | [Phase 6 — Tunnel](./19-Video-Phase-6-Tunnel-Checklist.md) | Remote operator without Azure (tunnel to PC/Pi) | PC | Config |
| **7** | [Phase 7 — Pi production bench](./20-Video-Phase-7-Pi-Production-Checklist.md) | Move edge to Pi 4/5; **Layout A-dev** (2× USB); E2E with ESP32 on LAN | **Pi** + local API | Config + docs |
| **8** | [Phase 8 — Azure cutover](./21-Video-Phase-8-Azure-Cutover-Checklist.md) | App Service + SQL + Blob; production URLs | Azure | Deploy |

Phases **2–6** may overlap partially after Phase 1 sign-off; order above is the recommended sequence.

### Active development path (2026-09-11)

| Topic | Decision |
|-------|----------|
| **Cameras** | **Layout A-dev** — **2× USB webcam** (front expression + rear tool view). Verified on PC. |
| **IP cameras** | **On hold** (V1-D9) — Galayou stock app + Thingino failed; 1b/1c not on critical path. |
| **Production edge** | **Pi 4/5 + 2× USB webcam** preferred while IP on hold (V1-D11) — no vendor cloud; outbound video only via SomNet session tunnel. Validate in [Phase 7](./20-Video-Phase-7-Pi-Production-Checklist.md). |
| **Next software phase** | [Phase 3 — Session tokens](./16-Video-Phase-3-Session-Tokens-Checklist.md) |

---

## Supported tool-site hardware (recap)

| Component | Production *(while IP on hold)* |
|-----------|----------------------------|
| Edge gateway | **Raspberry Pi 4/5** (8 GB validated) |
| Cameras | **Layout A-dev:** 2× USB webcam on Pi — *or* Layout A/B when IP resumes |
| NVR / Blue Iris | **Not required** |
| Vendor cloud | **None** with A-dev — contrast with Galayou IP + Wansview tunnel risk |

Phase 1–6 use a **PC** as edge; Phase 7 validates the **Pi** config before Azure.

---

## Repo layout

| Path | Purpose |
|------|---------|
| `SomNet.Edge/` | Sample go2rtc config, embed notes, edge agent (later phases) |
| `SomNet.UI/src/components/video/` | Video monitors (Phase 2+) |
| `SomNet.API/` | Video token + snapshot endpoints (Phase 3+) |

---

## Future enhancements (TODO)

### Personas

| Who | Where | Role |
|-----|--------|------|
| **Site installer** | Tool site — ESP32 `/config`, edge local UI, camera vendor app | Wi‑Fi, server URL, pairing, **camera/edge config** |
| **Remote operator (Dom)** | SomNet web app | Sessions, strokes, **view** feeds — should not edit RTSP/yaml |

Web app users ≠ device installers; configuration should not assume Dom edits env files at the bench PC.

### Video / edge settings flow (proposed)

```text
Site installer → ESP32 /config (and/or edge setup UI)
  → POST pairing/site video settings → SomNet API → database
  → Edge agent reads API → writes go2rtc.yaml / enables streams
  → Remote operator session → UI loads feed URLs/tokens from API (not .env)
```

| Item | Today (Phase 1–2 bench) | Target |
|------|-------------------------|--------|
| **Camera / stream config** | Manual `D:\SomNet.Edge\go2rtc.yaml`; manual `SomNet.UI/.env.*` | Installer UI → **API/DB** → edge agent + session tokens for operators |
| **IP camera firmware** | **On hold** (V1-D9) | **[Thingino](https://thingino.com/)** if IP path resumes ([G7](./14-Video-Phase-1b-Galayou-G7-Setup.md) · [G2](./14-Video-Phase-1b-Galayou-G2-Setup.md)) |
| **Bench / interim cameras** | **2× USB webcam** (A-dev) on PC; Pi 4 target (V1-D11) | Installer → API when settings UI exists |
| **ESP32 firmware** | Wi‑Fi, server URL, pairing only | Optional: edge base URL, layout A/B, RTSP hints — **sync to API** with pairing |
| **SomNet web UI** | Static env iframe URLs | Read **stored** edge/feed config per Sub; no operator-facing RTSP fields |

**Note:** Live video stays on **edge gateway (Pi/PC)**, not ESP32. ESP32 is a natural **installer-facing** config surface already used for site setup; edge may also expose a local admin page for go2rtc-specific fields.

Related: [03 — Future Enhancements](./03-Frontend-Architecture.md#future-enhancements) · [13 §13](./13-Video-And-Camera-Architecture.md#13-somnet-touchpoints-when-implemented) · [09 Device plan — pairing](./09-ESP32-Device-Plan.md).

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial plan + Phase 1–8 checklist stubs |
| 2026-09-11 | Future enhancements — installer (ESP32/local UI) → API/DB; operators consume only |
| 2026-09-11 | **Thingino preferred** for Galayou G2 (production IP rear) |
| 2026-09-11 | Phase 1 checkpoint — 1c Thingino flash blocks 1b sign-off and Phases 3–8 |
| 2026-09-11 | Pivot to G7 SD installer for bench; G2 1c deferred |
| 2026-09-11 | **V1-D9** — IP camera deferred; partial Phase 1 sign-off; Phase 3+ active |
| 2026-09-11 | **V1-D10/D11** — A-dev 2× webcam active; Pi 4 preferred production while IP on hold |
