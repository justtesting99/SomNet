# Phase 11 — Live automatic settings (`automatic-update`)

**Status:** **Planning — Phase A complete** (2026-09-08) — firmware **`0.11.0-phase11`**; API validation + ack timeout; firmware validate/log/ack stub (no replan).

| Related | Link |
|---------|------|
| Parent plan | [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §6 automatic |
| Prior sign-off | [Phase 10 checklist](./09-ESP32-Phase-10-Checklist.md) — burst-in-automatic (`burstsOn`) |
| Original design notes | [Phase 9 Part 2 §9](./09-ESP32-Phase-9-Part2-Automatic-Checklist.md#9-future--live-settings-during-automatic-playback-not-part-2) (superseded by this doc for implementation) |
| UI today | `AutomaticControls.tsx` — **`configLocked`** while session active; settings read-only |
| Device today | Config snapshot at **`automatic-start` only**; no mid-session replan |
| **Network layer** | [09-ESP32-Network-Spec.md](./09-ESP32-Network-Spec.md) — **implement + smoke S1–S8 before** hub-dependent Phase 11 E2E |

**Goal:** Restore original-product behavior — operator can change Automatic tab settings **while a session is running**; device **replans** from new config without stopping the session. New command key **`automatic-update`**.

**Explicitly out of scope (Phase 11):** OTA; session timeline/graph ([Phase 10 §8 future](./09-ESP32-Phase-10-Checklist.md#8-relationship-to-other-future-work)); changing **`delayBeforeStartSeconds`** mid-session (already elapsed or N/A); switching Dom/Sub mid-session.

---

## Phase 11 at a glance

| Item | Value |
|------|--------|
| **Goal** | `automatic-update` command; UI editable settings while `running`; device replan with **remaining** session envelope |
| **Duration** | ~2–3 weeks (decisions → Periodic smoke → all programs + bursts → UI E2E) |
| **Hardware scope** | Same DevKit bench (`esp32-84CCA85C36B4` / `Slv66`) |
| **Software scope** | Firmware replan path; API validation + ack timeout; UI unlock + debounced push; tests + docs |
| **Blocks** | Operators tuning power/timing/mode/end rules without Stop/Abort |
| **Target firmware** | **`0.11.0-phase11`** (proposed — bump in Phase A) |

Update **Status** above and check boxes in **§7** as work completes. When Phase 11 is done, update [Device plan §10](./09-ESP32-Device-Plan.md#10-implementation-phases) and bump firmware version.

---

## Prerequisites

- [x] Phase 10 **signed off** — burst sub-FSM, seven programs, Start/Stop/Abort, hub finalize
- [x] **§4 decisions locked** — 2026-09-08
- [ ] **[Network spec](./09-ESP32-Network-Spec.md) implemented** — smoke tests S1–S8 pass on bench hardware
- [ ] Review `AutomaticSessionMode` FSM — states `Idle`, `StartDelay`, `WaitingGap`, `Pulse`, `BurstPulse`, `BurstGap`
- [ ] Review planner separation — `AutomaticProgramBase::buildPlan()` vs sequencer (Part 2 §8)
- [ ] Review UI `configLocked` / settings debounce path (`SettingsProvider`, `AutomaticControls`)

---

## 1. What live update is (plain language)

Today, pressing **Start** sends one **`automatic-start`** snapshot; every control greys out until **Stop** or **Abort**. Phase 11 allows the operator to **dial in** power, timing, program mode, end-session rules, and burst settings **during** an ongoing session — matching the legacy product’s “adjustable during automatic playback.”

**Operator expectation:**

1. Session keeps running — no need to Stop and Start.
2. The **current stroke or burst stroke finishes** before the new pattern applies (proposed — see P11-D1).
3. **End Session After** counts **what already happened** — e.g. 40 of 100 strokes done → new plan has **60** remaining at the updated pattern.
4. **Stop** and **Abort** behave as today (including mid-burst cooperative stop — P10-D3).

**Not the same as:** starting a new session (`automatic-start` while running must remain **rejected** / busy).

---

## 2. Today vs Phase 11

| Concern | Today (Phase 10) | Phase 11 |
|---------|------------------|----------|
| Config source | **`automatic-start` only** | Start + **`automatic-update`** mid-session |
| UI while `running` | Read-only (`configLocked`) | **Editable** (policy per P11-D4) |
| Planner | Once at session start | **Re-run** on each accepted update |
| End session | Original quota from start | **Remaining** strokes/minutes (P11-D3) |
| Burst schedule | Fixed at start | **Recomputed** from remaining envelope (P11-D6) |
| Ack | N/A | Immediate accept (P9-D2 pattern); session continues |

---

## 3. Device state for replan

Part 2 §9 defined the minimum carry-forward state. Phase 11 extends it for bursts:

```text
sessionState = {
  mainStrokesCompleted,           // P10-D2 — mains only
  burstEventsCompleted,
  sessionStartMs,
  elapsedMs,
  endSessionMode,                 // may change on update (P11-D5)
  endSessionValueOriginal,        // audit / history optional
  remainingStrokes | remainingMinutes,  // derived at replan time
  sessionProgress,                // 0..1 for wave / build-up phase (P11-D2)
  automaticMode,                  // may change on update
  burstsOn,                       // may toggle — P11-D6
  burstSlotsConsumed,             // which milestone/deadline indices already fired
}
```

**Replan input:** `newConfig` + `sessionState` → `buildPlan(config, remainingEnvelope, progressOffset)`.

### 3.1 End session — remaining envelope (examples)

| Mode | Already ran | New plan uses |
|------|-------------|---------------|
| **strokes** | 40 of 100 | **60** remaining main strokes at new pattern |
| **minutes** | 12 of 30 min | **18** remaining minutes; wave `T_rise` may rescale (P11-D2) |
| **noAutoEnd** | N/A | Unbounded; replan uses new config until Stop/Abort |
| **Wave / build-up** | 50% of original envelope | Continue from **`t = 0.5`** vs reset — **P11-D2** |

### 3.2 Apply timing — overlapped replan (proposed P11-D1)

When **`automatic-update`** arrives during **`Pulse`** or **`BurstPulse`**:

```text
1. Mark pendingUpdate = true; stash newConfig (validate first)
2. Continue current relay pulse to normal OFF — do not truncate (unless P11-D1 alt)
3. During pulse tail / before next WaitingGap: newPlan = buildPlan(newConfig, remainingEnvelope, sessionState)
4. On pulse complete: swap program/plan; reset cadence index for new plan row 0
5. Enter WaitingGap with first row of new plan
```

When update arrives during **`WaitingGap`**, **`StartDelay`**, or **`BurstGap`**: apply after current gap completes (or immediately swap gap deadline — **P11-D7**).

**Heavy replan:** `buildPlan()` for 2048-row wave tables must stay non-blocking; budget milliseconds in cooperative loop (Part 2 §8).

---

## 4. Decisions (lock before coding)

**Locked 2026-09-08** — operator choices via decision form; technical defaults (P11-D9–D11, D13–D15) confirmed with proposed values.

| # | Decision | Options | Choice | Date |
|---|----------|---------|--------|------|
| P11-D1 | **Apply update timing** | Immediate relay OFF / after current stroke / after current **burst** | ☑ After current **main or intra-burst stroke**; overlapped `buildPlan()` during pulse tail (Part 2 P9P2-D28) | 2026-09-08 |
| P11-D2 | **Wave / build-up phase on update** | Keep phase `t` / reset to 0 / rescale to **remaining** envelope only | ☑ **Keep phase `t`** — continue at same progress (e.g. 50%) through new envelope | 2026-09-08 |
| P11-D3 | **End session counting** | Always remaining quota / allow extending total / reset quota | ☑ **Remaining** strokes or minutes only | 2026-09-08 |
| P11-D4 | **UI push model** | Debounced auto-save / blur-save / explicit **Apply** button | ☑ **Debounced auto-push** — mirror settings auto-save; send `automatic-update` after edit pause | 2026-09-08 |
| P11-D5 | **Editable fields while running** | All automatic fields / exclude end-session / exclude mode switch | ☑ All fields **except** `delayBeforeStartSeconds` | 2026-09-08 |
| P11-D6 | **Burst schedule on update** | Recompute from remaining envelope / keep old slots / freeze until session end | ☑ **Recompute** `burstEventCount` + slots from **remaining** mains/minutes | 2026-09-08 |
| P11-D7 | **Update during `WaitingGap` / `BurstGap`** | Wait full gap / apply immediately | ☑ **Wait full gap**, then apply new plan | 2026-09-08 |
| P11-D8 | **Update during active burst / `burstsOn: false`** | Finish entire burst / finish current intra-burst stroke only / immediate cut | ☑ After current **intra-burst stroke**; cancel rest of burst and pending burst slots when `burstsOn: false` | 2026-09-08 |
| P11-D9 | **Command key** | `automatic-update` / reuse other | ☑ **`automatic-update`** (P9P2-D30) | 2026-09-08 |
| P11-D10 | **Ack pattern** | Immediate accept / wait until replan applied | ☑ Immediate **`success: true`** when config valid + update queued (P9-D2) | 2026-09-08 |
| P11-D11 | **Reject while idle** | 400 if no session / silent no-op | ☑ **Reject** — no active automatic session | 2026-09-08 |
| P11-D12 | **Session history** | No record / PATCH summary note / append event log | ☑ **No record** for v1 — silent replan; final summary on stop/abort/end only | 2026-09-08 |
| P11-D13 | **Firmware version** | `0.11.0-phase11` / other | ☑ **`0.11.0-phase11`** at sign-off | 2026-09-08 |
| P11-D14 | **API validation** | Same as `automatic-start` / stricter | ☑ Same snapshot schema; reject invalid burst ranges when `burstsOn: true` | 2026-09-08 |
| P11-D15 | **UI read-only exceptions** | Start/Stop/Abort only / also lock program during burst | ☑ Unlock settings panels; **Start** disabled while running | 2026-09-08 |

---

## 5. Protocol — `automatic-update`

### 5.1 Command

| Property | Value |
|----------|--------|
| **Key** | `automatic-update` |
| **When** | Active `AutomaticSessionMode` only |
| **Payload** | Full automatic settings snapshot (same shape as `automatic-start`); **omit `running`** |
| **REST** | `POST /api/devices/commands` — same pipeline as other hardware commands |
| **Ack timeout** | **5 s** (immediate accept — proposed, mirror `automatic-start`) |

Optional future field (defer unless needed):

```json
{ "applyAfter": "currentStroke" }
```

Default behavior if omitted: **P11-D1**.

### 5.2 Payload validation

When **`burstsOn: true`**, validate burst sub-fields per [Phase 10 §4.1](./09-ESP32-Phase-10-Checklist.md#41-burst-field-validation-p10-d9-). UI minimums (gap ≥ 1 sec, burst mins ≥ 1) apply on send.

**Reject:**

- No active automatic session
- Invalid mode/end-session combo (wave + `noAutoEnd`)
- Malformed JSON / out-of-range fields

**Do not** stop session on validation failure — return ack `success: false`; operator may retry or Abort.

### 5.3 Device ack

```json
{
  "correlationId": "<uuid>",
  "success": true,
  "message": "automatic update queued"
}
```

No `resultJson` on update ack. Session summary still only on stop/abort/end via hub `automatic-session-complete`.

### 5.4 `resultJson` (optional extension)

If P11-D12 records updates in history, consider optional tier:

```json
{
  "updateCount": 2,
  "lastUpdateMs": 123456
}
```

Defer unless product wants audit trail in Phase 11 sign-off.

---

## 6. Architecture

### 6.1 Firmware touch set

| Area | Change |
|------|--------|
| `command_handler.cpp` | Route `automatic-update` → `execution_context` / `AutomaticSessionMode` |
| `automatic_session_mode.cpp/.h` | `pendingConfig_`, `applyPendingUpdate()`, replan hook in `poll()` / pulse callbacks |
| `automatic_config.cpp` | Parse update payload (reuse start parser) |
| Program classes | `buildPlan(config, remainingEnvelope, progress)` — verify signature supports replan |
| Burst planner | Recompute slots from **remaining** envelope (Phase 10 §3.6) |

### 6.2 FSM — update insertion points

```text
Idle ──start──► StartDelay ──► WaitingGap ⇄ Pulse
                                  ↓              ↓
                              BurstGap ⇄ BurstPulse
                                  ↑
                    automatic-update may arrive in any active state
                    apply policy: P11-D1, P11-D7, P11-D8
```

**Guardrails (from Part 2 §9):**

- Keep **planner** separate from **sequencer** — replan = new `buildPlan()` call, not FSM rewrite.
- **`mainStrokesCompleted`** and **`sessionStartMs`** already tracked — use for remaining envelope.
- Do **not** assume immutable config in planner API.

### 6.3 API touch set

| File | Change |
|------|--------|
| `HardwareCommandPayloadValidator.cs` | Allow `automatic-update`; validate like `automatic-start` |
| `HardwareCommandAckTimeout.cs` | 5 s for `automatic-update` |
| `SomNet.Shared` | Document command key if enum used |

### 6.4 UI touch set

| File | Change |
|------|--------|
| `AutomaticControls.tsx` | Remove or narrow `configLocked`; show “changes apply after current stroke” hint |
| `SettingsProvider` / save path | When `running`, debounced save → **`automatic-update`** in addition to PUT settings |
| `hardwareCommand.ts` | Send update command |
| `types/hardwareCommand.ts` | Add key + timeout constant |

**Open UX (P11-D4 — locked):** **Debounced auto-push** — settings persist to server on debounce; same debounce also sends **`automatic-update`** to device while session active. Show helper text: *“Changes apply after current stroke.”*

---

## 7. Suggested implementation order

1. **Lock §4 decisions** — review this doc with operator; mark ☑
2. **Phase A — Protocol stub** — API accepts `automatic-update`; firmware logs + immediate ack; no replan yet; **`0.11.0-phase11`** — **done 2026-09-08** (hardware smoke pending)
3. **Phase B — Replan without bursts** — Periodic + endSession strokes; change power/gap mid-session; serial `[AUTO] update applied`
4. **Phase C — All seven programs + remaining envelope** — strokes/minutes/noAutoEnd; wave phase policy (P11-D2)
5. **Phase D — Bursts** — update during mains-only; toggle `burstsOn`; recompute burst slots (P11-D6, P11-D8)
6. **Phase E — UI** — unlock controls; wire debounced/Apply push; error toast on reject
7. **Phase F — E2E verification** — hardware smokes §7.4; regression burst-off; Stop/Abort unchanged

---

## 8. Verification checklist

### 8.1 Phase A — protocol

- [x] `automatic-update` registered in firmware command handler
- [x] API validator + 5 s ack timeout
- [x] Reject when no automatic session active (P11-D11)
- [ ] Swagger smoke — ack success, serial `[AUTO] update received` (hardware)

### 8.2 Phase B — Periodic replan

- [ ] Start Periodic 20 strokes; at stroke 5 send update (shorter `strokeMaxSeconds`) — cadence changes after current stroke
- [ ] Remaining count — 15 strokes after 5 completed (P11-D3)
- [ ] Invalid payload — ack failure; session continues on old plan

### 8.3 Phase C — programs + end rules

- [ ] Random P+T — change min/max power mid-session
- [ ] Power Wave — change `T_rise` via end-session minutes update; phase policy per P11-D2
- [ ] Build-Up — update min/max power; ramp continues from progress
- [ ] Minutes mode — 30 min session, update at 10 min elapsed; ~20 min remaining

### 8.4 Phase D — bursts

- [ ] `burstsOn: true` → change `burstPercent` mid-session; new slots from remaining envelope
- [ ] `burstsOn: true` → `false` on update; cancel pending burst slots
- [ ] Update during intra-burst stroke — applies after that stroke (P11-D8)
- [ ] Stop/Abort during/after update — unchanged (P10-D3 regression)

### 8.5 Phase E — UI

- [ ] Controls editable while running (except Start / delay-before-start)
- [ ] Settings persist to server **and** device on change (P11-D4)
- [ ] Banner or helper text — “Changes apply after current stroke”
- [ ] Failed update — operator-visible error; session continues

### 8.6 Phase F — hardware smoke recipes

#### F1 — Periodic power tweak

| Step | Action | Pass if |
|------|--------|---------|
| 1 | Start Periodic, 10 strokes, slow gap | Session running |
| 2 | At stroke 3, send update — higher `maximumPower` | Ack success |
| 3 | Observe strokes 4+ | Stronger strokes; 7 mains remain |

#### F2 — Mode switch mid-session

| Step | Action | Pass if |
|------|--------|---------|
| 1 | Start Periodic, 20 strokes | Fixed cadence |
| 2 | At stroke 8, update to `randomPowerAndTiming` | Ack success |
| 3 | Strokes 9+ | Random power/gap within new bounds; 12 mains remain |

#### F3 — Burst percent replan

| Step | Action | Pass if |
|------|--------|---------|
| 1 | Start Random, `burstsOn`, 50%, 20 strokes | Bursts scheduled |
| 2 | At main 10, update to 100% | More burst events in remaining 10 mains |
| 3 | Complete session | `resultJson` counts consistent |

---

## 9. Relationship to other work

| Item | Relationship |
|------|----------------|
| **Phase 10 bursts** | Update must handle `BurstPulse` / `BurstGap`; recompute burst slots (§3, P11-D6) |
| **Session timeline graph** | Independent future work — richer `resultJson` would help replay |
| **OTA** | Out of scope |
| **Part 2 §9** | Design absorbed here; do not implement from Part 2 doc alone |

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-08 | **Phase A** — `automatic-update` API + firmware stub (`0.11.0-phase11`); PROTOCOL §6.8 |
| 2026-09-08 | **§4 decisions locked** — P11-D1–D15 (operator form + technical defaults) |
| 2026-09-08 | Initial Phase 11 planning doc — migrated from Part 2 §9 + Phase 10 burst constraints |
