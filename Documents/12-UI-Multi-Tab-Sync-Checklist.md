# UI Multi-Tab Sync — coordinate live state across browser tabs

**Status:** **Signed off** — bench T1–T9 pass (2026-09-11)

| Related | Link |
|---------|------|
| Session rehydration (single tab) | [10](./10-UI-Session-Rehydration-Checklist.md) · [11](./11-UI-Manual-Session-Rehydration-Checklist.md) — signed off |
| Frontend architecture | [03-Frontend-Architecture.md](./03-Frontend-Architecture.md) — Known Gaps § |
| Session model | [07-Session-And-History.md](./07-Session-And-History.md) |

**Goal:** When the operator has **two or more SomNet tabs** open, keep critical live state aligned so one tab cannot show **Start** while another is mid-session, miss hub finalize, or send commands for the wrong sub.

**Explicitly out of scope (v1):** Session timeline graph; firmware/API changes; real-time settings co-editing (last-write-wins on server remains); cross-device sync (phone + desktop).

---

## 1. Problem statement

Rehydration (P13/P14) fixes **refresh in one tab**. It does **not** fix **two live tabs**.

| State | Storage today | Divergence risk |
|-------|---------------|-----------------|
| `activeSession` | React only | Tab B may POST duplicate session while Tab A is mid-run |
| `settings.automatic.running` | React only | Tab B ignores hub finalize (`!running && !activeSession`) |
| `mode` | React + `localStorage` | Written cross-tab but **no `storage` listener** — UI stale until reload |
| `selectedSub` | React only | New tab always `Slv66`; commands/settings may target wrong sub |
| Auth session | React + `localStorage` | Logout in Tab A leaves Tab B authenticated until 401 |
| Pairing settings | Server + React | Debounced saves — last tab wins (acceptable v1) |

**Worst cases:**

1. Automatic running on device; Tab A has Stop/Abort; Tab B shows Start → operator starts duplicate session.
2. Device auto-ends; hub ack arrives in Tab B with `running=false` and no `activeSession` → session never finalized on server.
3. Tab A on `Slv66` mid-manual; Tab B on default sub sends stroke to wrong pairing.

---

## 2. Proposed locked decisions (review before implementation)

| ID | Decision | Proposed choice | Rationale |
|----|----------|-----------------|-----------|
| **P15-D1** | Transport | **`BroadcastChannel`** (`somnet-tab-sync`) for ephemeral live state + **`storage` events** for existing localStorage keys | No server/firmware change; works offline from hub |
| **P15-D2** | Sync scope v1 | **`activeSession` snapshot**, **`settings.automatic.running`**, **`mode`**, **`selectedSub`**, **auth logout/login** | Covers critical paths; defer settings field-level sync |
| **P15-D3** | Session payload | Broadcast **session id + mode + subTarget + startedAt**; receiver **rehydrates from server** (`GET /api/sessions/active` or by id) for manual events | Avoids syncing large manual event arrays; server is truth |
| **P15-D4** | Session cleared | Broadcast **`session:null`** when tab ends session or switches mode/sub | Other tabs clear local `activeSession` + `running` |
| **P15-D5** | Origin echo | Messages include **`tabId`**; ignore self-originated broadcasts | Prevent feedback loops |
| **P15-D6** | Tab open reconcile | On mount + **`visibilitychange` → visible**, re-fetch **`GET /api/sessions/active`** (same as rehydrator) | Catches missed broadcasts |
| **P15-D7** | Rehydrator interaction | Keep **once-per-load** guard (P14-D8); tab sync handles live updates | Switch mode fix must not regress |
| **P15-D8** | Command mutex v1 | **Soft lock** — broadcast `command-lock` while pending; other tabs **disable Start/Stroke** with banner | Reduces double-start; not a hard server lock |
| **P15-D9** | Settings edits | **No live cross-tab settings mirror** v1; optional refetch on tab focus later | Avoid fighting debounced PUT |
| **P15-D10** | Sub sync | **Choice A-a** — silent follow; end local session if sub differs | 2026-09-11 |
| **P15-D11** | Control model | **Choice B-a** — soft command lock; disable buttons while other tab pending | 2026-09-11 |
| **P15-D12** | Settings on focus | **Choice C-b** — no refetch v1; server last-write-wins | 2026-09-11 |

---

## 3. Message protocol (v1 draft)

```typescript
type TabSyncMessage =
  | { type: 'session'; tabId: string; session: ActiveSessionSnapshot | null }
  | { type: 'running'; tabId: string; running: boolean }
  | { type: 'mode'; tabId: string; mode: OperationMode | null }
  | { type: 'sub'; tabId: string; subTarget: SubTargetName }
  | { type: 'command-lock'; tabId: string; keys: string[] }
  | { type: 'request-sync'; tabId: string };  // ask other tabs to rebroadcast state
```

**localStorage (existing keys — add listeners only):**

| Key | Event | Action in other tabs |
|-----|-------|----------------------|
| `somnet-auth` | `storage` removed | Logout locally |
| `somnet-auth` | `storage` set | Reload session from JSON |
| `somnet.operationMode` | `storage` | `setModeState(stored)` without re-write |

---

## 4. Implementation checklist

### 4.1 Infrastructure

- [x] `tabSync.ts` — `tabId`, `BroadcastChannel` wrapper, subscribe/post helpers
- [x] `TabSyncProvider` (mount in `App.tsx`) — routes messages to providers
- [x] Unit tests — `tabSync.test.ts` (self-echo, remote-sync guard)

### 4.2 Provider integration

- [x] **SessionProvider** — post `session` on change; `syncSessionFromRemote` for incoming
- [x] **OptionsProvider** — post `running` on change; apply via TabSyncProvider
- [x] **ModeProvider** — `storage` listener for `somnet.operationMode`
- [x] **SubTargetProvider** — persist `selectedSub` to `localStorage` + broadcast; `applySubFromSync`
- [x] **AuthProvider** — `storage` listener for `somnet-auth`
- [x] **HardwareCommandProvider** — post `command-lock` while pending

### 4.3 UI

- [x] `TabSyncBanner` when another tab holds command lock
- [x] `CommandButton` disables on remote lock (P15-D11 soft lock)

### 4.4 Docs

- [x] Update [03-Frontend-Architecture.md](./03-Frontend-Architecture.md)
- [x] Update [07-Session-And-History.md](./07-Session-And-History.md) — multi-tab section
- [x] Update [User Guide](./User-Guide.md), [Hardware User Guide](./Hardware-User-Guide.md) — two tabs stay aligned

---

## 5. Smoke tests

**Terminology (matches the SomNet UI):**

| Term | Meaning |
|------|---------|
| **First browser tab** | The tab where you perform the action (same signed-in Dom, e.g. header shows your Dom name) |
| **Second browser tab** | A **separate** browser tab/window open to the same SomNet URL while still signed in — not **Switch mode** within one tab |
| **Choose operation mode** | Home screen with **Manual mode** / **Automatic mode** cards |
| **Switch mode** | Header button that returns to **Choose operation mode** |
| **Enter automatic mode** / **Enter manual mode** | Buttons on the mode cards |
| Header label | **Automatic mode** or **Manual mode** next to the Dom name when a mode is active |

**Important:** T1–T7 require **two browser tabs**. Using **Switch mode** → **Enter manual mode** → **Enter automatic mode** in a **single** tab is **not** a multi-tab test (see **T9** for that flow).

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **T1** | **First browser tab:** **Automatic mode** → **Start**. Open **second browser tab** (same URL, same Dom). In second tab, open **Automatic mode** if needed. | Second tab shows **Stop** and **Abort** (not **Start**) within ~1s; header shows **Automatic mode**; serial has **no `automatic-update` storm** | ☑ **2026-09-11** (after probe dedupe fix) |
| **T2** | **First tab:** **Stop**. **Second tab** (still on **Automatic mode**) | **Start** enabled; no ghost session | ☑ **2026-09-11** |
| **T3** | **First tab:** **Manual mode** → strokes. **Second tab** → **Manual mode** | Same session continues; further strokes append to one history row | ☑ **2026-09-11** (after `ensureManualSession` adopt fix) |
| **T4** | **First tab:** **Sign out**. **Second tab** | Login screen | ☑ **2026-09-11** |
| **T5** | **First tab:** change **Sub** (header Sub name). **Second tab** | Sub name in header matches | ☑ **2026-09-11** |
| **T6** | **First tab:** click **Start** (pending). **Second tab** on **Automatic mode** | Amber banner; **Start** disabled | ☑ **2026-09-11** |
| **T7** | **First tab:** automatic run until device ends. **Second tab** had stale UI | Session finalized; **Start** enabled | ☑ **2026-09-11** |
| **T8** | **First tab:** **Switch mode** while **Automatic mode** running. **Second tab** | Second tab shows **Choose operation mode** (not forced back into **Automatic mode**) | ☑ **2026-09-11** |
| **T9** | **Single tab only:** **Automatic mode** → **Start** → **Switch mode** → **Enter manual mode** → **Enter automatic mode** | Device stopped on **Switch mode**; **Enter automatic mode** shows **Start** (idle), not stuck **Start** while device runs | ☑ **2026-09-11** |

---

## 6. Architecture (target v1)

```text
First browser tab: Automatic mode → Start
  → SessionProvider.beginAutomaticSession → post { type: 'session', … }
  → OptionsProvider running=true → post { type: 'running', true }
Second browser tab: TabSyncProvider receives
  → syncSessionFromRemote / setAutomaticRunningLocal / setMode('automatic')
Second tab: on visibility visible (fallback)
  → GET /api/sessions/active → reconcile if drift
Switch mode (single tab): stopAutomaticForModeSwitch → device Stop + server /end
Re-enter Automatic mode: SessionRehydrator re-runs (per mode key)
```

**No firmware change.** Server session rows remain source of truth; sync layer prevents UI drift and duplicate POSTs.

---

## 7. Operator choices (pick a / b / c)

Record selections in §2 when locked (P15-D10–D12).

### Choice A — Sub sync when Tab A changes sub

| Option | Behavior |
|--------|----------|
| **a** *(recommended)* | **Silent follow** — Tab B updates `selectedSub` immediately via broadcast; ends local session if sub differs (same as in-tab sub change) |
| **b** | **Prompt** — Tab B shows banner: “Sub changed in another tab — switch to {sub}?” Accept / dismiss |
| **c** | **No cross-tab sub sync** — each tab keeps its own sub; only session/running/mode sync |

**Selected:** **a** — silent follow (P15-D10)

---

### Choice B — Control model (two tabs, one device)

| Option | Behavior |
|--------|----------|
| **a** *(recommended)* | **Soft command lock** — while Tab A has a pending hardware command, Tab B disables Start / Stroke / Burst / Abort with a short banner; no hard leader election |
| **b** | **Single control tab** — first tab to start a session becomes “control active”; other tabs are **read-only** (view status, no command buttons) until session ends |
| **c** | **No command mutex** — broadcast session/running only; operator responsible for not clicking in two tabs |

**Selected:** **a** — soft command lock (P15-D11)

---

### Choice C — Pairing settings when tab gains focus

| Option | Behavior |
|--------|----------|
| **a** | **Refetch on focus** — when tab becomes visible, `GET /api/settings` for current sub (respect `userEditedRef`; do not overwrite unsaved local edits) |
| **b** *(recommended)* | **No refetch v1** — settings sync only via explicit user edit in that tab; rely on server last-write-wins if both tabs edit |
| **c** | **Broadcast settings revision** — posting tab sends a “settings saved” tick; other tabs refetch only when they receive it |

**Selected:** **b** — no refetch v1 (P15-D12)

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial checklist — audit + P15-D1–D9 proposed |
| 2026-09-11 | §7 — operator choices A/B/C formalized (selections pending) |
| 2026-09-11 | **P15-D10–D12 locked** — A-a, B-a, C-b |
| 2026-09-11 | Implementation — TabSyncProvider, provider wiring, TabSyncBanner |
| 2026-09-11 | Fix Switch mode leaving device running; mode-aware SessionRehydrator; §5 UI terminology |
| 2026-09-11 | Fix multi-tab automatic-update storm — no device probe on peer sync; dedupe session/running |
| 2026-09-11 | Bench T2,T4–T9 pass; T3 partial — duplicate manual session on second tab |
| 2026-09-11 | T3 fix — `ensureManualSession` adopts in-progress server row; manual tab-sync refreshes events |
| 2026-09-11 | **T3 pass** — 3 strokes one history row (`11:48:34`–`11:48:42` serial) |
| 2026-09-11 | **Phase signed off** — T1–T9 pass |

---

## 8. Bench notes (2026-09-11)

**T3 (retest):** First tab 2 strokes @ 72%; second tab 1 stroke; single history row — serial shows 3 `stroke` commands, no duplicate session POST storm.

**T2:** Cooperative Stop from first tab; `manualStop` strokes=2–3; hub `automatic-session-complete` on both runs.

**Probe storm fix (T1):** Opening second tab during automatic must not flood `automatic-update` — verified clean serial after peer-sync dedupe.
