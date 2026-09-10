# UI Session Rehydration — browser refresh during active automatic session

**Status:** **Bench — R1/R2 pass** (2026-09-10); R3–R5 pending

| Related | Link |
|---------|------|
| Parent plan | [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) — post–Phase 11 follow-up |
| Origin | [Phase 11 checklist §9](./09-ESP32-Phase-11-Checklist.md#9-relationship-to-other-work) |
| Frontend | [03-Frontend-Architecture.md](./03-Frontend-Architecture.md) — Known Gaps § |
| Session model | [07-Session-And-History.md](./07-Session-And-History.md) |
| Network baseline | Phase 12 signed off — **`0.13.0-network`** |

**Goal:** After a browser refresh during an **automatic** session, restore **Stop / Abort**, hub finalize path, and server session linkage so the operator is not stuck with **Start** enabled while the device continues.

**Explicitly out of scope (this phase):** Session timeline graph; OTA; firmware changes; full manual-session event log rehydration; multi-tab sync.

---

## 1. Problem statement

| Layer | Today | After refresh |
|-------|-------|---------------|
| Device | `AutomaticSessionMode` running | Unchanged |
| Server | Session row `summary = "In progress"` | Unchanged |
| UI `SessionProvider.activeSession` | Set on Start | **Lost** (`null`) |
| UI `settings.automatic.running` | Set on Start | **Forced false** (`settings.ts` normalize) |
| `AutomaticSessionHubListener` | Finalizes on device complete | **Ignores** ack (`!automatic.running`) |

**Operator impact:** Device keeps stroking; UI shows Start; Stop/Abort unavailable; session may never receive final summary on device complete.

---

## 2. Locked decisions

| ID | Decision | Choice | Date |
|----|----------|--------|------|
| **P13-D1** | Scope v1 | **Automatic sessions only** | 2026-09-10 |
| **P13-D2** | Active session source | **Server** — latest in-progress session for Dom + Sub | 2026-09-10 |
| **P13-D3** | In-progress heuristic | `summary` equals `"In progress"` (automatic never PATCHes mid-run) | 2026-09-10 |
| **P13-D4** | `running` flag | Set **`running: true` locally** on rehydrate; **never** persist to settings API | 2026-09-10 |
| **P13-D5** | Hub finalize gate | Use **`activeSession?.mode === 'automatic'`**, not `settings.automatic.running` | 2026-09-10 |
| **P13-D6** | Mode switch on rehydrate | **`setMode('automatic')`** when automatic session rehydrated | 2026-09-10 |
| **P13-D7** | Stale session (server in-progress, device idle) | Stop/Abort may get `"no automatic session running"` → end server session with fallback summary | 2026-09-10 |
| **P13-D8** | Stale rehydrate guard | **`automatic-update` probe** — idle device → close stale server session | 2026-09-10 |

---

## 3. Implementation checklist

### 3.1 API

- [x] `GET /api/sessions/active?subTarget=` — latest in-progress session for authenticated Dom
- [x] `SomNetDataStore.GetActiveSession` — filter by Dom, Sub, in-progress summary
- [x] Document endpoint in [02-API-Reference.md](./02-API-Reference.md)

### 3.2 UI

- [x] `fetchActiveSession` + `sessionProgress` helpers
- [x] `SessionProvider.rehydrateSession(entry)` — restore `activeSession` without POST
- [x] `AutomaticSessionRehydrator` — on load / sub change, query active + rehydrate
- [x] `AutomaticSessionHubListener` — gate on `activeSession`, not `running`
- [x] `applyAutomaticDeviceComplete` — accept rehydrated sessions
- [x] Stale cleanup on Stop/Abort when device rejects (P13-D7)

### 3.3 Docs

- [ ] Update [03-Frontend-Architecture.md](./03-Frontend-Architecture.md) Known Gaps
- [ ] Update [Hardware User Guide](./Hardware-User-Guide.md) — refresh now safe for automatic
- [ ] Update [Device Plan](./09-ESP32-Device-Plan.md) follow-ups

---

## 4. Smoke tests

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **R1** | Start automatic; refresh mid-session; **Stop**; refresh again | Rehydrate shows Stop/Abort; stop ends device session; **second refresh** shows Start (not false rehydrate) | ☑ **2026-09-10** |
| **R2** | (Covered by R1) Stop after refresh | `manualStop` + hub `automatic-session-complete`; server session ended | ☑ **2026-09-10** |
| **R3** | Start automatic; refresh; let session **auto-end** on device | Hub listener finalizes; UI `running` clears; history entry complete | ☐ |
| **R4** | Start automatic; **Abort** on UI after refresh | Session ends; `(aborted)` or equivalent summary | ☐ |
| **R5** | No active session; refresh | No spurious `activeSession`; Start normal | ☐ |

---

## 5. Architecture (v1)

```text
Page load
  → OptionsProvider fetch settings (running: false)
  → AutomaticSessionRehydrator
       → GET /api/sessions/active?subTarget=
       → if automatic + "In progress":
            probe device (automatic-update accept/reject)
            if device idle → POST /end stale server session; skip rehydrate
            else → rehydrateSession + running + setMode('automatic')
  → AutomaticSessionHubListener (uses activeSession for finalize)
```

**No firmware change.** Device authority unchanged; UI catches up to server + device state.

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-10 | Initial checklist — post Phase 12 sign-off; P13-D1–D8 locked; implementation started |
| 2026-09-10 | R1 partial — post-stop refresh false rehydrate; fix finalize order + device idle probe |
| 2026-09-10 | **R1/R2 pass** — refresh mid-session → Stop → refresh shows Start; device `manualStop` 2 strokes @ 14:04:07 |

### 6. Bench notes (2026-09-10)

**R1/R2** (`esp32-84CCA85C36B4` / `Slv66`, `randomPowerAndTiming`):

- `14:03:52` `automatic-start` → strokes 1–2
- Refresh mid-session — UI rehydrated (Stop/Abort enabled)
- `14:04:07` `automatic-stop` → `[AUTO] complete reason=manualStop` strokes=2
- `automatic-session-complete` hub ack with `resultJson`
- Refresh after stop — **Start** enabled (no false rehydrate)

**Fixes in this run:** `finalizeSession` clears local state only after `/end` succeeds; cooperative Stop awaits hub finalize; rehydrator probes device idle before restoring UI.
