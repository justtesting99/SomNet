# Session & History

SomNet tracks live sessions during operation and persists them for historical review. Manual sessions produce rich aggregated summaries; automatic sessions record summaries from device **`resultJson`** (stroke counts, duration, and — when bursts are on — main stroke and burst event counts).

## Session Lifecycle

### Session ID Format

Sequential string IDs: `sess-001`, `sess-002`, … generated server-side.

### When Sessions Start

| Mode | Trigger | API Call |
|------|---------|----------|
| Manual | First stroke or burst | `POST /api/sessions` |
| Automatic | Start button pressed | `POST /api/sessions` |

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
| Manual | Switch mode | End before mode change | `mode-switch` |
| Manual | Sign out | End before logout | `sign-out` |
| Manual | Change sub | End before sub switch | `sub-change` |
| Automatic | Stop button | `POST /api/sessions/{id}/end` | Device `resultJson` → `(stopped manually)` |
| Automatic | Abort button | `POST /api/sessions/{id}/end` | Device `resultJson` via hub → `(aborted)` |
| Automatic | End-session rule (device) | `POST /api/sessions/{id}/end` | Hub `automatic-session-complete` → `(end session rule)` |
| Automatic | Switch mode / sign-out / sub-change | Same as manual | respective reason |

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

**UI:** `HistoryDialog.tsx` — opened from header "History" button.

### Dom Sessions Dialog (cross-Sub)

**API:** `GET /api/history/sessions?domTarget={dom}` with optional `subTarget` filter

Lists all sessions for the Dom across all subs. Supports sub filter dropdown.

**UI:** `DomSessionsDialog.tsx` — opened by clicking the Dom name in the header.

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
| In-progress summary | Client builds, server stores latest PATCH |
| Selected sub | Client state; triggers settings reload |

On page refresh during an active manual session, the in-progress session may exist server-side with the last PATCHed summary, but the local event log is lost. The UI does not currently resume editing an in-progress session after refresh.

---

## SessionProvider Key Methods

| Method | Purpose |
|--------|---------|
| `recordManualStroke(powerPercent)` | Append stroke, start/update session |
| `recordManualBurst(...)` | Append burst, start/update session |
| `endManualSession(reason)` | End with aggregated summary |
| `beginAutomaticSession()` | POST new automatic session |
| `endAutomaticSession(reason, deviceResult?)` | End with device-measured summary |
| `endActiveSessionIfNeeded(reason)` | Guard for navigation events |

All methods are async and handle API errors internally (logged, not always surfaced to UI).

---

## Future Enhancements

- Resume in-progress session after page reload
- Server-side automatic stroke engine with live progress updates
- Session export (CSV/PDF)
- Retention policies and archival
- Real-time session sync via SignalR for multi-operator scenarios
