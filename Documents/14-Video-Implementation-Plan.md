# Video Implementation Plan

**Status:** Phase 1 **in progress** (1a webcam front)  
**Architecture (source of truth):** [13-Video-And-Camera-Architecture.md](./13-Video-And-Camera-Architecture.md)

Video work is **separate from ESP32 firmware phases** and **separate from UI rehydration / multi-tab checklists**. Develop on **local PC + LocalDB** until Phase 8; **no Azure hosting required** until then ([13 §15](./13-Video-And-Camera-Architecture.md#15-deployment-order--local-first-azure-last)).

---

## Phase summary

| Phase | Checklist | Goal | Host | SomNet code? |
|-------|-----------|------|------|--------------|
| **1** | [Phase 1 — Edge bench](./14-Video-Phase-1-Edge-Bench-Checklist.md) | go2rtc + cameras → HLS in browser | **PC** | No — **1a in progress** |
| **2** | [Phase 2 — UI embed](./15-Video-Phase-2-UI-Embed-Checklist.md) | `VideoFeed` iframes in dashboard (LAN URLs) | PC | UI — **in progress** |
| **3** | [Phase 3 — Session tokens](./16-Video-Phase-3-Session-Tokens-Checklist.md) | API mints session-scoped stream tokens; UI fetches on session start | PC + local API | API + UI |
| **4** | [Phase 4 — Action snapshots](./17-Video-Phase-4-Action-Snapshots-Checklist.md) | Capture on device ack; local disk or Azurite; link to session events | PC + local API | API + edge script |
| **5** | [Phase 5 — Edge agent](./18-Video-Phase-5-Edge-Agent-Checklist.md) | Session start/end → enable streams; token validation at gateway | PC | API + edge agent |
| **6** | [Phase 6 — Tunnel](./19-Video-Phase-6-Tunnel-Checklist.md) | Remote operator without Azure (tunnel to PC/Pi) | PC | Config |
| **7** | [Phase 7 — Pi production bench](./20-Video-Phase-7-Pi-Production-Checklist.md) | Move edge to Pi 4/5; Layout A or B; E2E with ESP32 on LAN | **Pi** + local API | Config + docs |
| **8** | [Phase 8 — Azure cutover](./21-Video-Phase-8-Azure-Cutover-Checklist.md) | App Service + SQL + Blob; production URLs | Azure | Deploy |

Phases **2–6** may overlap partially after Phase 1 sign-off; order above is the recommended sequence.

---

## Supported tool-site hardware (recap)

| Component | Production |
|-----------|------------|
| Edge gateway | **Raspberry Pi 4/5** |
| Cameras | **Layout A:** 1× webcam + 1× IP — **Layout B:** 2× IP |
| NVR / Blue Iris | **Not required** |

Phase 1–6 use a **PC** as edge; Phase 7 validates the **Pi** config before Azure.

---

## Repo layout

| Path | Purpose |
|------|---------|
| `SomNet.Edge/` | Sample go2rtc config, embed notes, edge agent (later phases) |
| `SomNet.UI/src/components/video/` | Video monitors (Phase 2+) |
| `SomNet.API/` | Video token + snapshot endpoints (Phase 3+) |

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial plan + Phase 1–8 checklist stubs |
