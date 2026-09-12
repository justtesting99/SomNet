# Video — Phase 4 Action snapshots (local storage)

**Status:** **Sign-off pending** — V4-T1/T2/T3 pass (manual); automatic snapshots deferred

> **Phase 3:** Signed off (V3-T4 deferred).

| Related | Link |
|---------|------|
| Architecture §9 | [13 — Snapshot timing](./13-Video-And-Camera-Architecture.md#9-snapshot-timing-and-session-linkage) |
| Plan | [14-Video-Implementation-Plan.md](./14-Video-Implementation-Plan.md) |

**Goal:** On **device command ack**, capture front + rear stills; store on **local disk**; attach metadata to session action (API + DB).

**Out of scope (Phase 4):** Azure Blob production; edge agent auto-trigger ([Phase 5](./18-Video-Phase-5-Edge-Agent-Checklist.md)); automatic per-stroke snapshots (later); heartbeat front-only between actions.

---

## Locked decisions (v1)

| ID | Decision | Choice |
|----|----------|--------|
| **V4-D1** | Trigger | **UI callback** after hardware command ack (manual stroke/burst first) |
| **V4-D2** | Capture source | go2rtc `GET /api/frame.jpeg?src={front\|rear}` (API HttpClient → localhost:1984) |
| **V4-D3** | Storage | Local disk under `data/snapshots/` (dev); Azurite optional later |
| **V4-D4** | Rear timing | Front immediate; rear after **1 s** settle (`RearSettleDelayMs`, configurable) |
| **V4-D5** | Linkage | DB row per feed: `sessionId` + `actionIndex` + `feed`; serve via `GET /api/video/snapshots/{id}/image` |
| **V4-D6** | Scope | Manual stroke/burst first; automatic snapshots deferred |

---

## Implementation checklist

### API

- [x] `SessionActionSnapshots` table + migration
- [x] `VideoSnapshotService` — grab JPEG from go2rtc, write disk, persist rows
- [x] `POST /api/video/sessions/{sessionId}/snapshots?subTarget=` — capture front + rear for `actionIndex`
- [x] `GET /api/video/sessions/{sessionId}/snapshots` — list for history
- [x] `GET /api/video/snapshots/{snapshotId}/image` — authenticated JPEG
- [x] Config: `Video:Snapshots` in `appsettings.Development.json`

### UI

- [x] Fire-and-forget capture after manual stroke/burst ack (`SessionProvider`)
- [x] History dialog — stills per session (V4-T2 UI; smoke test open)
- [ ] Automatic mode snapshots (post–Phase 5 or later slice)

### Tests

- [x] Unit tests — path building, rear delay ordering (mock HttpClient)

---

## Smoke tests

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **V4-T1** | Manual stroke → ack | Front + rear JPEG saved; rows in DB; `GET …/snapshots` returns URLs | ☑ **2026-09-11** |
| **V4-T2** | View session history | Stills visible for action | ☑ **2026-09-11** (with T1) |
| **V4-T3** | Rear settle delay | Rear `capturedAt` ≥ front + ~1 s (if enabled) | ☑ **2026-09-11** |

**Exit:** V4-T1–T3 → [Phase 5](./18-Video-Phase-5-Edge-Agent-Checklist.md).

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial stub |
| 2026-09-11 | Phase 3 complete; v1 decisions; API + manual capture hook |
| 2026-09-11 | Fix — add missing `AddSessionActionSnapshots.Designer.cs` so EF applies migration |
| 2026-09-11 | V4-T1/T2/T3 pass — JPEGs on disk + history gallery; rear settle ~1 s |
