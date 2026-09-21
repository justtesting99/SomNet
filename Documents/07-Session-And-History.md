# Session & History

SomNet tracks live sessions during operation and persists them for historical review. Manual sessions produce rich aggregated summaries; automatic sessions record summaries from device **`resultJson`** (stroke counts, duration, and — when bursts are on — main stroke and burst event counts).

## Session Lifecycle

### Session in Progress (P16)

Dom **Session in Progress** (header slide switch) gates both UI and firmware:

- Switch **ON** only when system **Ready**, Sub **double-click** ack is present, and a mode (Manual or Automatic) is selected ([P16 checklist](./25-Session-Accessory-In-Progress-Checklist.md)).
- **Stroke**, **Burst**, and automatic **Start** are blocked until the switch is **ON**; firmware rejects `stroke`, `burst`, and `automatic-start` when the **`session-accessory`** output is off (GPIO32).
- Each **OFF→ON** creates a **new** server session (`POST /api/sessions`). **Manual ↔ automatic** while the switch stays **ON** keeps the **same** session id (optional `PATCH` with `mode`).
- **ON→OFF** ends the session normally, or **DELETE** discards a placeholder with no strokes and no automatic **Start** (P16-D9).
- Switch **OFF** is blocked while stroke/burst/start is pending or automatic is **running** (use **Abort** or wait for idle first).

Client hint: `sessionStorage` records switch state per Dom+Sub for refresh; **`SessionRehydrator`** restores server rows only when that hint says in progress.

### Session ID Format

Sequential string IDs: `sess-001`, `sess-002`, … generated server-side. History and Dom sessions dialogs show **Session ID** on each row. The header switch shows the id only when **Options → Debug → Show active session ID in header** is enabled.

### When Sessions Start

| Mode | Trigger | API Call |
|------|---------|----------|
| Manual | **Session in Progress ON** (creates row); strokes/bursts **PATCH** the same row | `POST /api/sessions` on switch ON; updates on each action |
| Automatic | **Session in Progress ON** (creates row); **Start** runs the device program on that row | `POST /api/sessions` on switch ON; `automatic-start` when operator presses Start |

Initial summary for automatic sessions: `"In progress"` (unchanged until end — no mid-run PATCH).

Initial summary for manual sessions: `"In progress"` or `"In progress: …"` as actions accumulate.

### When Sessions Update

| Mode | Trigger | API Call |
|------|---------|----------|
| Manual | Each stroke or burst | `PATCH /api/sessions/{id}` |

The UI rebuilds the summary from the local event log after each action.

### When Sessions End

| Mode | Trigger | API Call | End Reason |
|------|---------|----------|------------|
| Manual | Abort button | `POST /api/sessions/{id}/end` | `abort` |
| Manual | Switch mode (switch **OFF**) | End before mode change | `mode-switch` |
| Manual / Automatic | Switch mode while **Session in Progress ON** | Stops automatic device if needed; **keeps** server session row | — (P16-D7) |
| Manual | Sign out | End before logout | `sign-out` |
| Manual | Change sub | End before sub switch | `sub-change` |
| Automatic | Stop button | `POST /api/sessions/{id}/end` | Hub `automatic-session-complete` (or REST) → device `resultJson` → `(stopped manually)` |
| Automatic | Abort button | `POST /api/sessions/{id}/end` | Hub `automatic-session-complete` → `(aborted)` |
| Automatic | End-session rule (device) | `POST /api/sessions/{id}/end` | Hub `automatic-session-complete` → `(end session rule)` |
| Automatic | Switch mode / sign-out / sub-change | Same as manual | respective reason |

When a single accessory session includes **manual actions then an automatic run**, ending in automatic mode produces a **combined summary** (`manual segment; automatic segment`) on the session row. Snapshot groups still carry per-action **`actionSummary`** and Manual/Automatic badges in the UI.

`SessionProvider.endActiveSessionIfNeeded()` is called from AppShell before destructive navigation actions.

---

## Manual Session Event Log

The UI maintains an in-memory event log in `SessionProvider`:

```typescript
type ManualActionEvent =
  | { type: 'stroke'; powerPercent: number }
  | { type: 'burst'; powerPercent: number; burstStrokes: number; burstDelaySeconds: number };
```

Each stroke and burst appends an event. Abort increments an abort counter.

### Summary Aggregation

`utils/sessionSummary.ts` groups events:

**Strokes** — counted by power percent:

```
2 strokes at 60%
```

**Bursts** — counted by power + stroke count + delay:

```
1 burst at 75% (5 strokes @ 5s delay)
```

**Combined example:**

```
2 strokes at 60%, 1 burst at 75% (5 strokes @ 5s delay).
```

**In progress:**

```
In progress: 1 stroke at 45%.
```

**With aborts:**

```
2 strokes at 60%, 1 abort.
```

**Empty session:**

```
No strokes or bursts.
```

---

## Automatic Session Summaries

Built by `buildAutomaticSessionSummary()` from device `resultJson` (Stop, Abort, or end-session rule):

**Part 2 (bursts off):**

```
Periodic — 8 strokes over 38 sec (end session rule).
Periodic — 4 strokes over 20 sec (aborted).
Power Wave — 12 strokes over 5 min (stopped manually).
```

**Phase 10 (`burstsOn: true`):** summary includes **main stroke count** and **burst event count** (P10-D6):

```
Periodic — 8 main strokes, 1 burst event over 1 min (end session rule).
Periodic — 80 main strokes, 8 burst events over 25 min (stopped manually).
Periodic — 45 main strokes, 4 burst events over 12 min (aborted).
```

- **`mainStrokesCompleted`** — main program singles only (End Session **Strokes** limit)
- **`burstEventsCompleted`** — scheduled burst slots finished
- **`strokesCompleted`** — alias of main count for Part 2 compatibility
- Intra-burst relay pulses are optional detail in `burstDetails[]` (device `resultJson`)

When the hub delivers `automatic-session-complete` with `resultJson`, stroke count and duration come from the device. If hub delivery fails, the UI falls back to a generic reason (e.g. `Automatic session aborted.`).

---

## API Session DTOs

### StartSessionRequestDto

| Field | Type | Description |
|-------|------|-------------|
| subTarget | string | Current sub name |
| mode | OperationMode | `Manual` or `Automatic` |
| summary | string | Initial summary text |

### UpdateSessionRequestDto

| Field | Type | Description |
|-------|------|-------------|
| summary | string | Updated summary |
| mode | OperationMode? | Optional — same session row when switching Manual ↔ Automatic with switch ON |

### EndSessionRequestDto

| Field | Type | Description |
|-------|------|-------------|
| summary | string | Final summary |

### SessionHistoryEntryDto (response)

| Field | Type |
|-------|------|
| id | string |
| startedAt | ISO datetime |
| domTarget | string |
| subTarget | string |
| mode | string |
| summary | string |

The **`mode`** column reflects the **last** operation mode on the row (used for rehydration and API queries). The History UI does **not** show a single Manual/Automatic badge on the session card — mixed manual→automatic sessions would mislead if only the final mode were labeled.

---

## History Views

### History Dialog (per Sub)

**API:** `GET /api/history/timeline?domTarget={dom}&subTarget={sub}`

Returns a merged, sorted timeline of:

- **Sessions** — completed and in-progress records
- **Notifications** — scheduled session notifications

Optional date filtering: `fromDate`, `toDate` query params (also filtered client-side in the dialog).

Timeline items are discriminated by `type`:

```json
{ "type": "session", "id": "sess-001", "startedAt": "...", "summary": "..." }
{ "type": "notification", "id": "...", "sentAt": "...", "subject": "...", "sessionDateTime": "..." }
```

**UI:** `HistoryDialog.tsx` — opened from header "History" button. Each session card shows:

- Timestamp (and **Started** line when `lastActivityAt` differs)
- **Session ID** (`sess-…`)
- **Summary** — full text for the accessory session. Mixed manual then automatic runs store **`manual part; automatic part`** when the session ends in automatic mode with prior manual events (see `SessionProvider.endAutomaticSession`).
- **`SessionSnapshotGallery`** when video is configured (no session-level mode pill)

**Action snapshots (Phase 4+):** Grouped by **`actionIndex`**. **Manual:** one still group per **stroke** or per **whole burst** (on device ack). **Automatic:** **one still group** when the run completes ([V4-D8](./17-Video-Phase-4-Action-Snapshots-Checklist.md)) — not per stroke during automatic ([V4-D9](./17-Video-Phase-4-Action-Snapshots-Checklist.md)). Each group shows:

- A **Manual** or **Automatic** badge (derived from snapshot `commandKey` / correlation id, not from the session row’s `mode`)
- **`actionSummary`** — one-line caption (e.g. `Manual stroke at 60% (480 ms)`, `Random Power and Timing — 4 main strokes over 1 min (stopped manually)`), built on capture by `SessionActionSnapshotSummaryBuilder` and stored on `SessionActionSnapshots`

Images load via `GET /api/video/snapshots/{id}/image` (`AuthenticatedSnapshotImage`). Front + rear by default, or rear only via **Options → Action snapshot cameras**. **Double-click** opens `SnapshotLightbox`. Encrypted on disk ([24](./24-Video-Snapshot-Encryption-Checklist.md)). Legacy rows without `actionSummary` use short fallbacks from `commandKey` (`utils/snapshotActionCaption.ts`).

### Dom Sessions Dialog (cross-Sub)

**API:** `GET /api/history/sessions?domTarget={dom}` with optional `subTarget` filter

Lists all sessions for the Dom across all subs. Supports sub filter dropdown.

**UI:** `DomSessionsDialog.tsx` — opened by clicking the Dom name in the header. Shows date, optional **Sub** chip when viewing all subs, session id, and summary (same text as History). **No** session-level mode badge. Action stills are shown in **History** for the selected sub, not in this cross-sub list.

---

## Notifications

Notifications are separate from live sessions — they represent scheduled/upcoming session announcements.

### Creating a Notification

**UI:** Notify dialog (header "Notify" button)

**API:** `POST /api/notifications`

```json
{
  "subTarget": "Slv66",
  "sessionDateTime": "2026-09-10T18:00:00",
  "subject": "Upcoming Session"
}
```

Notifications appear in the history timeline alongside sessions.

**Email delivery:** Not implemented. The API persists the record and returns success. Future work will integrate an email provider.

---

## Data Scoping

All session and history queries filter by `domTarget` (and usually `subTarget`). This ensures:

- Each Dom sees only their own sessions
- Sub selection in the UI determines which timeline loads
- Cross-Dom data isolation is enforced at the database query level

Historical subs from sessions/notifications appear in the subs list even without an explicit assignment (unless excluded).

---

## UI State vs Server State

| Concern | Source of truth |
|---------|-----------------|
| Active session ID | `SessionProvider` state, synced to server |
| Manual event log | Client memory until PATCH/end |
| Completed sessions | Server (`Sessions` table) |
| In-progress summary | Manual: client builds, server stores latest PATCH. Automatic: `"In progress"` until end |
| Selected sub | Client state; triggers settings reload |
| Active session after refresh | Restored via `GET /api/sessions/active` (automatic: + device probe; manual: parse PATCH summary) |

### Session rehydration (browser refresh)

When the operator reloads the page during an active session, `SessionRehydrator` calls **`GET /api/sessions/active?subTarget=`** after settings load **only if Session in Progress is on** for that Dom+Sub (client storage hint).

**Manual:**

1. If `mode === 'manual'` and summary is in progress (`"In progress"` or `"In progress: …"`), parse the aggregated summary with `parseManualInProgressSummary` into `{ events, abortCount }`.
2. `SessionProvider.rehydrateSession(entry)` restores `activeSession` without a new POST; mode switches to manual.
3. No device probe — manual abort would interrupt hardware mid-burst.

**Automatic:**

1. Exact summary `"In progress"` required on client (automatic never PATCHes mid-run).
2. UI probes device with **`automatic-update`** (accept = still running; idle → stale server record → `POST /end`, skip rehydrate).
3. On success: `rehydrateSession` + local `settings.automatic.running` true (not persisted) + mode automatic.

Hub finalize (`AutomaticSessionHubListener`) gates on **`activeSession?.mode === 'automatic'`**, not the `running` flag.

See [10-UI-Session-Rehydration-Checklist.md](./10-UI-Session-Rehydration-Checklist.md) and [11-UI-Manual-Session-Rehydration-Checklist.md](./11-UI-Manual-Session-Rehydration-Checklist.md).

### Multi-tab sync (live tabs)

`TabSyncProvider` broadcasts session, `running`, **`session-accessory`**, sub, and command-lock state across tabs via `BroadcastChannel`. Auth and mode use `localStorage` `storage` events. New tabs send `request-sync` on load; visible tabs reconcile via `GET /api/sessions/active` when the accessory switch is on.

See [12-UI-Multi-Tab-Sync-Checklist.md](./12-UI-Multi-Tab-Sync-Checklist.md).

---

## SessionProvider Key Methods

| Method | Purpose |
|--------|---------|
| `recordManualStroke(powerPercent)` | Append stroke, start/update session |
| `recordManualBurst(...)` | Append burst, start/update session |
| `endManualSession(reason)` | End with aggregated summary |
| `startSessionForAccessory(mode)` | POST new session when Session in Progress turns ON |
| `endSessionForAccessory(...)` | End or DELETE placeholder when switch turns OFF |
| `beginAutomaticSession()` | Used within automatic Start flow on an existing accessory session |
| `endAutomaticSession(reason, deviceResult?)` | End with device-measured summary |
| `rehydrateSession(entry)` | Restore `activeSession` from server row (no POST) — used after browser refresh |
| `endActiveSessionIfNeeded(reason)` | Guard for navigation events |

All methods are async and handle API errors internally (logged, not always surfaced to UI).

---

## Future Enhancements
- Server-side automatic stroke engine with live progress updates
- **Session timeline / graph** — visual representation of a planned or completed automatic session (main strokes, bursts, gaps, relative power). Placement TBD: Automatic mode page, session history detail, or both. See [Phase 10 checklist §8](./09-ESP32-Phase-10-Checklist.md#8-relationship-to-other-future-work).
- Session export (CSV/PDF)
- Retention policies and archival
- Real-time session sync via SignalR for multi-operator scenarios
