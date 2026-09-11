# UI Manual Session Rehydration — browser refresh during active manual session

**Status:** **Implementation complete** — bench smoke tests pending (2026-09-10)

| Related | Link |
|---------|------|
| Automatic rehydration | [10-UI-Session-Rehydration-Checklist.md](./10-UI-Session-Rehydration-Checklist.md) — signed off |
| Session model | [07-Session-And-History.md](./07-Session-And-History.md) |
| Frontend | [03-Frontend-Architecture.md](./03-Frontend-Architecture.md) |

**Goal:** After a browser refresh during a **manual** session, restore `SessionProvider.activeSession` (including aggregated event log and abort count parsed from the server PATCH summary) so the operator can continue stroking on the **same session row** without starting a duplicate POST.

**Explicitly out of scope:** Per-stroke timing for grouped strokes (summary is lossy); device probe (abort probe would interrupt mid-burst); multi-tab sync; session timeline graph.

---

## 1. Problem statement (before this phase)

| Layer | Before fix | After refresh (broken) |
|-------|--------------|------------------------|
| Server | Session row `summary = "In progress: …"` (PATCHed after each action) | Unchanged |
| UI `SessionProvider.activeSession` | Set on first stroke | **Lost** (`null`) |
| Next stroke | Continues same session ID | **New** session POST (duplicate row) |

**Operator impact:** History shows two sessions for one run; prior strokes lost from client-side aggregation until end.

---

## 2. Locked decisions

| ID | Decision | Choice | Date |
|----|----------|--------|------|
| **P14-D1** | Scope | **Manual sessions only** (automatic already P13) | 2026-09-10 |
| **P14-D2** | Active session source | **Server** — same `GET /api/sessions/active?subTarget=` as automatic | 2026-09-10 |
| **P14-D3** | In-progress heuristic | `summary` starts with `"In progress"` (includes `"In progress: …"`) | 2026-09-10 |
| **P14-D4** | Event log restore | **Parse aggregated PATCH summary** back into `{ events, abortCount }` (lossy for grouped strokes without per-stroke ms) | 2026-09-10 |
| **P14-D5** | Device probe | **None** — manual abort probe would interrupt device; trust server summary | 2026-09-10 |
| **P14-D6** | Mode switch on rehydrate | **`setMode('manual')`** when manual session rehydrated | 2026-09-10 |
| **P14-D7** | Rehydrator component | **`SessionRehydrator`** handles both manual and automatic paths | 2026-09-10 |

---

## 3. Implementation checklist

### 3.1 UI utilities

- [x] `parseManualInProgressSummary(summary)` — round-trip with `buildManualSessionSummary`
- [x] `isRehydratableManualSession(entry)` in `sessionProgress.ts`
- [x] Unit tests — `manualSessionRehydrate.test.ts`, `sessionProgress.test.ts`

### 3.2 UI integration

- [x] `SessionProvider.rehydrateSession` — parse manual summary into `events` / `abortCount`
- [x] `SessionRehydrator` — manual branch: fetch active → rehydrate → `setMode('manual')` (no device probe)
- [x] `AutomaticSessionRehydrator` re-exports `SessionRehydrator` for backward compatibility
- [x] `App.tsx` mounts `SessionRehydrator`

### 3.3 Docs

- [x] [03-Frontend-Architecture.md](./03-Frontend-Architecture.md) — manual rehydration flow + Known Gaps
- [x] [07-Session-And-History.md](./07-Session-And-History.md) — manual rehydration section
- [x] [Hardware User Guide](./Hardware-User-Guide.md), [User Guide](./User-Guide.md)
- [x] [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) follow-ups
- [x] [Documents/README.md](./README.md) index

---

## 4. Smoke tests

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **M1** | Manual: 2 strokes; refresh; 1 more stroke; **End session** | One session row; summary includes all 3 strokes | ☐ |
| **M2** | Manual: stroke + burst; refresh; end session | Parsed events include burst params; single session row | ☐ |
| **M3** | Manual: stroke; **Abort** mid-burst; refresh; end | Abort count restored; summary correct | ☐ |
| **M4** | No active session; refresh (manual mode) | No spurious `activeSession`; first stroke starts new session | ☐ |
| **M5** | In-progress automatic session; refresh | Automatic path unchanged (P13 regression) | ☐ |

---

## 5. Architecture

```text
Page load
  → OptionsProvider fetch settings
  → SessionRehydrator (after settingsLoaded, no activeSession)
       → GET /api/sessions/active?subTarget=
       → if manual + isSessionInProgress(summary):
            parseManualInProgressSummary(summary)
            rehydrateSession(entry) + setMode('manual')
       → else if automatic + exact "In progress":
            device probe (automatic-update) … (P13 path)
```

**Lossy restore:** Grouped strokes (`2 strokes at 60%`) expand to individual events without `actualStrokeMs`. Single-stroke segments with `(1399 ms)` preserve timing.

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-10 | Initial checklist — P14-D1–D7; implementation + unit tests |
