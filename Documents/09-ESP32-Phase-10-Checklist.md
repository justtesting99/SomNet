# Phase 10 — Burst-in-automatic (`burstsOn`)

**Status:** **Planning** — design discussion; **no code changes until §4 decisions locked**.

| Related | Link |
|---------|------|
| Parent plan | [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §6 automatic + manual burst |
| Prior sign-off | [Phase 9 Part 2 checklist](./09-ESP32-Phase-9-Part2-Automatic-Checklist.md) — seven programs, Start/Stop/Abort |
| Manual burst reference | [Phase 9 checklist](./09-ESP32-Phase-9-Checklist.md) — `BurstSequenceMode` |
| UI burst panel | `SomNet.UI/src/components/modes/AutomaticControls.tsx` — **Burst Settings** (disabled today) |
| Device rejection today | `automatic_config.cpp` — `[AUTO] reject: burstsOn not supported` |

**Goal:** When **Bursts On** is checked, the ESP32 runs **bursts inside an automatic session** — additive on top of the selected automatic program (Periodic, Random, Wave, etc.). Operator enables burst settings in the UI; device accepts `burstsOn: true` on `automatic-start`.

**Explicitly out of scope (Phase 10):** Live **`automatic-update`** mid-session ([Part 2 §9](./09-ESP32-Phase-9-Part2-Automatic-Checklist.md#9-future--live-settings-during-automatic-playback-not-part-2)); OTA; new burst styles beyond **`fixedPowerDelay`**.

---

## Phase 10 at a glance

| Item | Value |
|------|--------|
| **Goal** | `burstsOn: true` on automatic-start; bursts interleaved with program cadence; session summary still from device `resultJson` |
| **Duration** | ~1–2 weeks (design lock → Periodic+burst smoke → all modes → UI enable → E2E) |
| **Hardware scope** | Same DevKit (`esp32-84CCA85C36B4` / `Slv66`); relay **D4** |
| **Software scope** | `AutomaticSessionMode` burst sub-FSM; payload validation; enable UI Burst Settings; tests + docs |
| **Blocks** | Operators using **Bursts On** during automatic (panel hard-disabled since Part 2) |
| **Target firmware** | **`0.10.0-phase10`** (proposed — lock in §4) |

Update **Status** above and check boxes in **§7** as work completes. When Phase 10 is done, update [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 and bump firmware version.

---

## Prerequisites

- [x] Phase 9 Part 2 **signed off** — automatic Start/Stop/Abort, seven programs, hub auto-end/abort
- [x] Phase 9 manual **burst** signed off — `BurstSequenceMode`, abort during burst, dual ack pattern
- [x] Burst Settings UI fields exist and **round-trip in settings JSON** (controls disabled until Phase 10)
- [ ] **§4 decisions locked** (this document) — **required before firmware/UI coding**
- [ ] Review `BurstSequenceMode` FSM — gap/pulse/abort pattern to reuse or embed
- [ ] Review `AutomaticSessionMode` — `WaitingGap` / `Pulse` / `StartDelay` states

---

## 1. What burst-in-automatic is (plain language)

Automatic mode today runs **single strokes** on a schedule chosen by the program (fixed, random, or pre-computed wave). **Bursts On** adds occasional **multi-stroke clusters** inside that same session:

- The **base program** still controls the overall rhythm and (when bursts are off) each stroke’s power and gap.
- When bursts are **on**, some cadence steps become a **burst** (N rapid strokes with short delays) instead of one stroke.
- **Stop**, **Abort**, and **End Session After** behave as today — abort still cuts the relay immediately; stop waits for a safe point (see §3).

This is **not** manual burst mode. Manual burst is a one-shot command with fixed count, power, and delay. Automatic burst is **embedded** in a long-running automatic session and uses **ranges** (min/max strokes, power, delay) plus a **probability** (`burstPercent`).

---

## 2. UI fields (already implemented — enable in Phase 10)

| Field | Type | Purpose (intended) |
|-------|------|-------------------|
| **Bursts On** | checkbox | Master enable; when false, device behaves as Part 2 (single strokes only) |
| **Percent (0–100)** | `burstPercent` | How often a cadence step becomes a burst vs a normal single stroke — **exact rule TBD (§4 P10-D1)** |
| **Burst Style** | `burstStyle` | Today only **`fixedPowerDelay`** — per-stroke power and delay drawn from ranges each burst |
| **Burst Stroke Power min/max** | 0–100 % | Maps to `strokeMs` via min/max stroke ms (same as manual/automatic power mapping) |
| **Delay Between Burst Strokes** | min/max sec | Inter-stroke gap **inside** a burst (mirror manual burst `burstDelayMs`) |
| **Number of Strokes in Each Burst** | min/max | How many pulses per burst event |

**Part 2 behavior (today):** entire Burst Settings panel is **hard-disabled** in `AutomaticControls`; API/device **reject** `burstsOn: true` on `automatic-start`.

**Phase 10 UI exit:** enable panel when not `running`; validate ranges on save; send full snapshot including burst fields on Start.

---

## 3. Execution semantics (discussion — lock in §4)

### 3.1 Layering model (recommended baseline)

```text
automatic session loop:
  optional delayBeforeStart
  repeat until stop / end rule / abort:
    program → (power, gapSec) for this cadence step     ← AutomaticProgramBase
    if burstsOn && shouldTriggerBurst():                 ← NEW (P10-D1)
        run burst sub-sequence (N strokes, burst delays)  ← NEW sub-FSM
    else:
        single pulse at program power
    wait gapSec (program gap — between cadence steps)     ← unchanged Part 2
```

**Key idea:** A **cadence step** is either one normal stroke **or** one burst event, then the **program gap** before the next step.

### 3.2 Manual burst vs automatic burst (comparison)

| Aspect | Manual `burst` command | Automatic burst (Phase 10) |
|--------|------------------------|----------------------------|
| **Trigger** | Operator clicks Burst | Device rolls / rules vs `burstPercent` each cadence step |
| **Power** | Single `powerPercent` all strokes | Uniform random in `[burstStrokePowerMin, burstStrokePowerMax]` per stroke |
| **Stroke count** | Fixed `burstStrokes` | Uniform random in `[burstStrokesMin, burstStrokesMax]` per burst event |
| **Inter-stroke delay** | Fixed `burstDelayMs` | Uniform random in `[burstDelayMin, burstDelayMax]` seconds per gap inside burst |
| **After sequence** | Command completes; ack once | Returns to automatic loop; program `gapSec` before next step |
| **Session** | Manual session events | Same automatic session; `strokesCompleted` in stop/abort/end `resultJson` |
| **Abort** | Dual ack (burst fail + abort ok) | Abort ends whole automatic session (Part 2 pattern + hub complete) |

### 3.3 Stroke counting and end-session rules

**Proposed (P10-D2):** **`strokesCompleted`** counts **every relay pulse** — single strokes and every stroke inside a burst — toward:

- End Session **Strokes** limit
- Session summary text (`N strokes over …`)

**Open:** Should burst **events** also appear separately in a future rich summary (e.g. “12 strokes including 2 bursts”)? Part 2 summary is stroke-count + duration only — **defer** unless P10-D6 chooses otherwise.

### 3.4 Abort and stop during burst

| Action | During single stroke | During burst sub-sequence |
|--------|---------------------|---------------------------|
| **Stop** | Finish current pulse, then stop at gap (Part 2) | **Proposed (P10-D3):** finish current pulse, stop at next safe point (end of burst or between burst strokes — TBD) |
| **Abort** | `relay_->abort()` immediately (Part 2) | **Proposed:** same — open relay now; end session `endReason=abort`, `interrupted=true` |

**Proposed (P10-D3):** Match Part 2 **stop = cooperative**, **abort = immediate** — during intra-burst pulses, abort opens relay; stop completes current pulse then exits burst/automatic at next boundary.

### 3.5 Interaction with seven automatic programs

Bursts are **orthogonal** to program selection:

| Program | Normal step | With bursts on |
|---------|-------------|----------------|
| **Periodic** | Max power, max gap | Burst rolls replace some steps; between steps still max gap |
| **Random\*** | Random power/gap per step | Roll first; if burst, use burst ranges instead of single stroke for that step |
| **Wave / Build-Up** | Pre-computed `(power, gap)` row | Same roll at each index; burst overrides single pulse for that row |

**Open (P10-D4):** When burst triggers on a random/wave step, does the **program gap** after the burst still use the program’s planned `gapSec` for that index? **Proposed: yes** — burst delays are internal; program gap is between cadence steps.

### 3.6 `burstPercent` — candidate rules (pick one in §4)

| Option | Rule | Pros | Cons |
|--------|------|------|------|
| **A — per-step Bernoulli** | Each cadence step: `esp_random() % 100 < burstPercent` → burst | Simple; matches “Percent” label | Clusters can bunch randomly |
| **B — deterministic stride** | Every `round(100 / burstPercent)`-th step is burst | Predictable | Awkward at low/high %; not true “percent” |
| **C — per-minute rate** | Derive burst events from elapsed time | Smooth over long sessions | Harder to explain; needs clock |

**Recommendation for discussion:** **Option A** unless original product docs specify otherwise.

### 3.7 Timing diagram (one burst event)

```text
─── program gap ───┬── burst stroke 1 ── bd ── stroke 2 ── bd ── stroke 3 ──┬─── program gap ───
                   └─ burstStrokes=3, bd = burst delay (random in range) ─┘
```

- `bd` = intra-burst delay (seconds → ms in FSM)
- Program `gapSec` applies **before** the next cadence step (single or burst)

---

## 4. Decisions (lock before coding)

| # | Decision | Options | Choice | Date |
|---|----------|---------|--------|------|
| P10-D1 | **`burstPercent` meaning** | A Bernoulli / B stride / C time-based | ☐ TBD | |
| P10-D2 | **End-session stroke count** | All pulses / cadence steps only | ☐ **Proposed:** all relay pulses | |
| P10-D3 | **Stop during intra-burst** | After current pulse / after full burst / immediate | ☐ TBD | |
| P10-D4 | **Program gap after burst** | Always program gap / zero gap / max(burst, program) | ☐ **Proposed:** always program `gapSec` | |
| P10-D5 | **Burst power source** | Always burst ranges / blend with program power / program power + burst delay only | ☐ **Proposed:** burst ranges only when burst triggers | |
| P10-D6 | **Session summary** | Stroke count only / + burst event count | ☐ **Proposed:** stroke count only (Part 2 format) | |
| P10-D7 | **Architecture** | Embed burst FSM in `AutomaticSessionMode` / extract shared `BurstRunner` / delegate to `BurstSequenceMode` | ☐ **Proposed:** embed sub-FSM in `AutomaticSessionMode` (keep one `IExecutionMode` active) | |
| P10-D8 | **`burstsOn: false` payload** | Accept omitted / require explicit false | ☐ **Proposed:** accept omitted as false (Part 2 compatible) | |
| P10-D9 | **API validation** | Reject invalid burst ranges / clamp | ☐ TBD — mirror manual burst caps | |
| P10-D10 | **Firmware version** | `0.10.0-phase10` / other | ☐ **Proposed:** `0.10.0-phase10` | |
| P10-D11 | **UI — burst panel while running** | Read-only (Part 2) / editable (needs §9 live update) | ☐ **Proposed:** read-only while `running` (same as Part 2) | |
| P10-D12 | **Random burst parameters** | `esp_random()` uniform per burst / per stroke | ☐ **Proposed:** new draw each burst event and each intra-burst delay | |

**Inherited (unchanged):** P9-D2 immediate `automatic-start` ack; P9-D4 summary on stop/abort/end only; P9-D1 ack timeouts; abort hub `automatic-session-complete`.

---

## 5. Architecture sketch

### 5.1 Why not reuse `execution_context.startBurst()`

`execution_context` allows **one** active `IExecutionMode`. Starting manual `BurstSequenceMode` during automatic would **replace** `AutomaticSessionMode` — session state and program index would be lost.

**Preferred:** `AutomaticSessionMode` gains nested states:

```text
Idle → StartDelay → WaitingGap ⇄ Pulse
                      ↓
                   BurstPulse ⇄ BurstGap (N strokes)
```

Reuse **relay** APIs and timing patterns from `BurstSequenceMode` (copy or shared helper), not the standalone mode class.

### 5.2 Files (expected touch set)

| Area | Files |
|------|--------|
| Firmware FSM | `automatic_session_mode.cpp/.h` |
| Config parse | `automatic_config.cpp` — remove Part 3 reject; validate burst ranges |
| Programs | `AutomaticProgramBase` — no change if burst wraps `getStrokeParameters` output |
| API | `HardwareCommandPayloadValidator.cs` — allow `burstsOn: true`; validate burst fields |
| UI | `AutomaticControls.tsx` — enable Burst Settings; remove Part 3 placeholder text |
| Tests | Firmware native tests (if any) + UI payload/validation tests |
| Docs | `PROTOCOL.md`, Device Plan §6, Hardware User Guide |

### 5.3 `resultJson` (automatic stop / complete)

No new fields required for Phase 10 minimum — **`strokesCompleted`** includes burst pulses. Optional future: `burstsCompleted` count (only if P10-D6 extended).

---

## 6. Suggested implementation order

1. **Lock §4 decisions** — review this doc; mark choices ☑
2. **Phase A — Config + reject removal** — parse/validate burst fields; `burstsOn: true` accepted; still no burst FSM (or stub log)
3. **Phase B — Burst sub-FSM on Periodic** — `burstPercent=100` smoke (always burst); serial `[AUTO] burst …`; then real percent
4. **Phase C — All seven programs + abort/stop** — burst rolls with random/wave/build-up; stop/abort during burst
5. **Phase D — API + UI** — enable panel; validator; E2E Periodic with bursts on
6. **Phase E — Docs + version** — `0.10.0-phase10`, sign-off

---

## 7. Verification checklist

### 7.1 Firmware smoke (Swagger / serial)

- [ ] `automatic-start` with `burstsOn: true` — ack success (no Part 3 reject)
- [ ] Periodic + `burstPercent=100` — serial shows burst clusters + program gaps
- [ ] Periodic + `burstPercent=0` — identical to Part 2 (singles only)
- [ ] Abort mid-burst — relay open; `[AUTO] aborted`; hub/session `(aborted)` with partial stroke count
- [ ] Stop mid-burst — cooperative stop per P10-D3
- [ ] End-session **strokes** limit — burst pulses increment counter correctly

### 7.2 UI E2E

- [ ] Burst Settings enabled when idle; disabled while running
- [ ] Start with Bursts On → session runs → Stop — history shows plausible stroke count
- [ ] Abort during burst-in-automatic — UI unlocks (reuse Phase F hub path)

### 7.3 Regression

- [ ] `burstsOn: false` — Part 2 behavior unchanged (all seven modes)
- [ ] Manual burst/stroke/automatic without bursts — unchanged

---

## 8. Relationship to other future work

| Item | Relationship |
|------|----------------|
| **Part 2 §9 `automatic-update`** | Independent — live replan does not require bursts; bursts complicate replan (burst sub-state must be handled on update) |
| **OTA (Phase 7 partitions)** | None — same binary size concern; monitor flash if burst code duplicates `BurstSequenceMode` |
| **Session history richness** | Optional burst-event line in summary — defer unless P10-D6 extended |

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-07 | Initial Phase 10 checklist — burst-in-automatic design discussion (split from Part 2 “Part 3”) |
