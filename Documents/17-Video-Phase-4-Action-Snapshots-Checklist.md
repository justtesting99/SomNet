# Video — Phase 4 Action snapshots (local storage)

**Status:** **Signed off** (2026-09-13) — manual v1 + automatic session-end still (V4-D8)

> **Phase 3:** Signed off (V3-T4 deferred).

| Related | Link |
|---------|------|
| Architecture §9 | [13 — Snapshot timing](./13-Video-And-Camera-Architecture.md#9-snapshot-timing-and-session-linkage) |
| Plan | [14-Video-Implementation-Plan.md](./14-Video-Implementation-Plan.md) |

**Goal:** On **device command ack**, capture action stills (front + rear by default, or **rear only** via Options); store on **local disk**; attach metadata to session action (API + DB).

**Out of scope (Phase 4):** Azure Blob production; edge agent auto-trigger ([Phase 5](./18-Video-Phase-5-Edge-Agent-Checklist.md)); heartbeat front-only between actions. **Encryption at rest** moved to [24 — Snapshot encryption](./24-Video-Snapshot-Encryption-Checklist.md) — **signed off 2026-09-13**. **Automatic session-end still** (one capture per session — not per stroke) — **locked, not implemented** ([V4-D8](#locked-decisions-v1)).

---

## Locked decisions (v1)

| ID | Decision | Choice |
|----|----------|--------|
| **V4-D1** | Trigger | **API fire-and-forget** after successful hardware ack (`VideoActionSnapshotTrigger` in `DevicesController`; manual stroke/burst first) |
| **V4-D2** | Capture source | go2rtc `GET /api/frame.jpeg?src={front\|rear}` (API HttpClient → localhost:1984) |
| **V4-D3** | Storage | Local disk under `data/snapshots/` (dev); Azurite optional later |
| **V4-D4** | Rear timing | Front immediate; rear after **1 s** settle (`RearSettleDelayMs`, configurable) |
| **V4-D5** | Linkage | DB row per feed: `sessionId` + `actionIndex` + `feed`; serve via `GET /api/video/snapshots/{id}/image` |
| **V4-D6** | Scope | Manual stroke/burst first; automatic session-end still deferred to V4-D8 slice |
| **V4-D7** | Feed selection | **Options → General** `actionSnapshotFeeds`: `both` (default) or `rear` — persisted in `appOptions`; API reads pairing settings on capture ([2026-09-12](./18-Video-Phase-5-Edge-Agent-Checklist.md) post-sign-off) |
| **V4-D8** | Automatic timing | **One still per automatic session** when the session completes — same idea as **manual burst** (one capture when the whole sequence finishes, not per relay pulse). Trigger: device hub ack **`correlationId=automatic-session-complete`** (Stop cooperative finish, Abort, or end-session rule) — the moment the UI clears **`running`**, hides Stop/Abort, and re-enables **Start**. **Not** on `automatic-start` accept ack; **not** per main stroke or intra-burst pulse during the run. Uses same `actionSnapshotFeeds` as manual. |

---

## Implementation checklist

### API

- [x] `SessionActionSnapshots` table + migration
- [x] `VideoSnapshotService` — grab JPEG from go2rtc, write disk, persist rows
- [x] `POST /api/video/sessions/{sessionId}/snapshots?subTarget=` — capture configured feeds for `actionIndex` (optional body `feeds` override)
- [x] `GET /api/video/sessions/{sessionId}/snapshots` — list for history
- [x] `GET /api/video/snapshots/{snapshotId}/image` — authenticated JPEG
- [x] Config: `Video:Snapshots` in `appsettings.Development.json`

### UI

- [x] ~~Fire-and-forget capture after manual stroke/burst ack (`SessionProvider`)~~ → **Phase 5:** API `VideoActionSnapshotTrigger` on hardware ack
- [x] History dialog — `SessionSnapshotGallery` stills per session (`AuthenticatedSnapshotImage` + JWT blob fetch)
- [x] **Options → General** — **Action snapshot cameras** (`both` \| `rear`); single-column gallery layout when one feed per action
- [x] **Automatic session-end still** ([V4-D8](#locked-decisions-v1)) — API capture on hub `automatic-session-complete` in `HardwareHub.AckCommand` via `VideoActionSnapshotTrigger.TryCaptureAfterAutomaticSessionCompleteAsync`

### Tests

- [x] Unit tests — `BuildRelativePath`, `SanitizePathSegment`, `ShouldCaptureFeed` (`VideoSnapshotServiceTests.cs`; rear delay not unit-tested)

---

## Smoke tests

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **V4-T1** | Manual stroke → ack | Front + rear JPEG saved; rows in DB; `GET …/snapshots` returns URLs | ☑ **2026-09-11** |
| **V4-T2** | View session history | Stills visible for action | ☑ **2026-09-11** (with T1) |
| **V4-T3** | Rear settle delay | Rear `capturedAt` ≥ front + ~1 s (if enabled) | ☑ **2026-09-11** |
| **V4-T4** | Options → rear only → stroke | One rear JPEG per action; no front row/file | ☑ **2026-09-12** |

**Exit:** V4-T1–T3 → [Phase 5](./18-Video-Phase-5-Edge-Agent-Checklist.md). V4-T4 optional post–Phase 5 enhancement.

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial stub |
| 2026-09-11 | Phase 3 complete; v1 decisions; API + manual capture hook |
| 2026-09-11 | Fix — add missing `AddSessionActionSnapshots.Designer.cs` so EF applies migration |
| 2026-09-11 | V4-T1/T2/T3 pass — JPEGs on disk + history gallery; rear settle ~1 s |
| 2026-09-12 | Manual v1 signed off; doc sync (tests wording, gallery component names) |
| 2026-09-12 | **V4-D7** — `actionSnapshotFeeds` option (both \| rear); API respects pairing settings on ack capture |
| 2026-09-12 | Future note — snapshot encryption at rest (disk + SQL metadata) |
| 2026-09-13 | Encryption moved to [24](./24-Video-Snapshot-Encryption-Checklist.md) — signed off; V4-D1 trigger wording updated (API ack path) |
| 2026-09-13 | **V4-D8** — automatic = one still at session complete (burst-like), not per stroke; trigger = `automatic-session-complete` hub ack |
| 2026-09-13 | **V4-D8 implemented** — `HardwareHub.AckCommand` + `IsAutomaticSessionEndSnapshotAck` |
