# Burst placement modes — design (relay + motor)

**Status:** Implemented (2026-10-27) — firmware, API, relay UI preview; motor UI mirrors placement fields (burst execution on motor device TBD per doc 31).  
**Parent:** [Phase 10 — Burst-in-automatic](./09-ESP32-Phase-10-Checklist.md) (signed off; behavior preserved as **session spread**)  
**Related:** [Frontend Architecture § Burst Settings](./03-Frontend-Architecture.md), [Motor actuator design § Bursts](./31-Motor-Actuator-Device-Design.md), [SignalR & Hardware](./06-SignalR-And-Hardware.md)

---

## 1. Problem statement

Phase 10 **`burstPercent`** answers: *“How many burst **events** fit in the session **envelope**, placed at equal spacing?”*  
That envelope is **minutes** (wall-clock), **strokes** (main-stroke count), or **unbounded** (`noAutoEnd` cadence).

Operators also want:

1. **Deterministic stroke share** — about **`percent`** of main strokes get a burst **immediately after** (evenly spaced indices or stride).
2. **Stochastic per stroke** — each main stroke has an independent **`percent`** **chance** of being followed by a burst cluster.

This document adds a **selectable `burstPlacement`** so one percent slider has an explicit meaning, with **UI warnings** and **default = Phase 10** (`sessionSpread`).

---

## 2. Locked product decisions (2026-10-27)

| ID | Decision |
|----|----------|
| **BP-D1** | Add **`burstPlacement`** with **three** values (§3). Default **`sessionSpread`**. |
| **BP-D2** | **`afterMainStroke`** and **`chanceAfterMainStroke`** use **stroke-based** evaluation only (after each **main** stroke completes). **No** wall-clock burst timers for either. Applies to **all** `endSessionMode` values (including **minutes**). |
| **BP-D3** | **End session after a burst:** if a burst triggers on the same main-stroke completion as an end rule, **run the burst cluster first**, then end the session. |
| **BP-D4** | **Load mitigation:** UI encourages **lower `burstPercent`** for stroke-linked placements; extra copy for **`chanceAfterMainStroke`** (unpredictable cluster count). No hard firmware cap in v1 beyond burst stroke min/max. |
| **BP-D5** | **`burstPercent` label and hint depend on `burstPlacement`** from first paint. |
| **BP-D6** | **Relay:** firmware + preview graph + live segments for all three placements. |
| **BP-D7** | **Motor:** same DTO/settings + UI; firmware **M4** — burst = short speed/duty dip (ramp) then resume program (§8). |
| **BP-D8** | **`automatic-update`:** deterministic placements **replan** (§4.4). **`chanceAfterMainStroke`** only changes **future** rolls (no retroactive burst/no-burst changes on past strokes). |
| **BP-D9** | **Docs + tests** per §10. |
| **BP-D10** | **`sessionSpread`** keeps Phase 10 rounding (`round(envelope × percent / 100)`). **`afterMainStroke`** uses stride/milestones (§4.2). **`chanceAfterMainStroke`** uses per-stroke roll (§4.3) — **percent = 0** never bursts; **100** bursts after every main stroke. |
| **BP-D11** | **Chance roll (device):** after main stroke `n`, burst if `burstPercent > 0` and `(esp_random() % 100) < burstPercent` (uniform 0–99). **Not** the same as Phase 10 “percent = event count”; only used when placement is **`chanceAfterMainStroke`**. |
| **BP-D12** | **Preview graph:** seeded PRNG per `(session seed, mainStrokeIndex)` so idle preview is **repeatable**; label as illustrative for chance mode. **Live** graph uses device segments only (actual rolls). |

---

## 3. Placement modes (operator-facing)

| UI label (proposed) | JSON `burstPlacement` | Meaning of **Percent (0–100)** |
|---------------------|-------------------------|--------------------------------|
| **Spread across session** | `sessionSpread` | **Phase 10:** burst **event count** ≈ `round(envelope × percent / 100)`, **evenly spaced** (minutes → wall-clock; strokes → milestones; `noAutoEnd` → every Nth main). |
| **After main strokes (even)** | `afterMainStroke` | **Deterministic:** about **`percent`** of main strokes get a burst **after** that stroke — **even spacing** (stride or stroke milestones). Same main-stroke index every run for same settings. |
| **Chance after each main stroke** | `chanceAfterMainStroke` | **Random:** each main stroke, independent **`percent`** probability of a burst **immediately after** that stroke. Expected share ≈ `percent`, but **count varies** run to run. |

**Default:** `sessionSpread`.

**When `burstsOn` is false:** `burstPlacement` is ignored (still round-trips in settings).

**Not confused with `burstStyle`:** `randomPowerOnly` / `randomDelayOnly` only randomize **inside** a burst cluster (power/delay). **`chanceAfterMainStroke`** randomizes **whether** a cluster runs after a given main stroke.

---

## 4. Execution semantics (relay firmware)

Shared: burst sub-FSM (Phase 10 §2.1–2.2), `mainStrokesCompleted` excludes intra-burst strokes, stop/abort unchanged.

### 4.1 `sessionSpread` (preserve Phase 10)

| `endSessionMode` | Burst plan kind | Trigger |
|------------------|-----------------|---------|
| `minutes` | `WallClockDeadlines` | `WaitingGap` when `now >= sessionStart + milestoneMs` |
| `strokes` | `StrokeMilestones` | After main stroke when `mainStrokesCompleted >= milestone[k]` |
| `noAutoEnd` | `CadenceStride` | After main stroke when `mainStrokesCompleted >= nextCadenceTriggerStroke` |

Formulas: [Phase 10 §3.6](./09-ESP32-Phase-10-Checklist.md).

### 4.2 `afterMainStroke` (deterministic)

| `endSessionMode` | Burst plan kind | Trigger |
|------------------|-----------------|---------|
| `minutes` | `CadenceStride` | After main stroke when `mainStrokesCompleted >= nextCadenceTriggerStroke` |
| `strokes` | `StrokeMilestones` | After listed milestone main strokes (P10-D21) |
| `noAutoEnd` | `CadenceStride` | P10-D19 stride |

```text
stride = (100 + burstPercent / 2) / burstPercent   // integer, min 1 when percent > 0
```

Stroke end mode:

```text
burstEventCount = round(endSessionValue × burstPercent / 100)
milestone k: main stroke index = (k × endSessionValue) / burstEventCount
```

**Minutes:** session ends on clock; bursts only when stride hits between mains. **BP-D3** at last stroke before minute elapses.

### 4.3 `chanceAfterMainStroke` (stochastic)

**No milestone table.** On every main-stroke completion (all `endSessionMode` values):

```text
if burstPercent >= 100 → trigger burst
else if burstPercent <= 0 → no burst
else if (esp_random() % 100) < burstPercent → trigger burst
else → no burst
```

Then apply **BP-D3** (burst before end-session check if triggered).

**Properties:**

- Independent rolls per main stroke (memoryless).
- Long-run frequency ≈ `burstPercent / 100`; short sessions high variance (e.g. 25% × 8 strokes may yield 0–8 bursts).
- **Wall-clock end:** only main strokes that complete before the minute ends are rolled; no bursts “scheduled” at 60 s without a main stroke.

**`burstPlan.active`:** may be `true` with kind **`ChancePerMainStroke`** (no milestones) so session start logs `burstsOn` + placement; trigger path is **`shouldTriggerBurstAfterMainStroke`** or a dedicated **`shouldTriggerChanceBurstAfterMainStroke`**.

### 4.4 End session vs burst (BP-D3)

On **`onRelayPulseComplete`**:

1. Increment `mainStrokesCompleted`.
2. Apply pending `automatic-update`.
3. If `burstsOn` && placement triggers (**milestone / stride / chance roll**) → `beginBurstEvent()`; **return**.
4. Stop / end-session checks.

**`poll()` `WaitingGap`:** wall-clock bursts only for **`sessionSpread` + minutes**. Chance and deterministic stroke modes **never** use `shouldTriggerBurstInWaitingGap`.

After **`finishBurstEvent()`**, run stop/end checks.

### 4.5 Mid-session replan (Phase 11)

| Placement | Replan behavior |
|-----------|-----------------|
| `sessionSpread` | Today’s `buildAutomaticBurstPlanForReplan` |
| `afterMainStroke` | Rebuild milestones/stride from remaining stroke budget + advance past completed |
| `chanceAfterMainStroke` | Update `burstPercent` / placement in config only; **do not** re-roll past strokes; next main stroke uses new percent |

---

## 5. Wire format & shared layers

### 5.1 JSON

```json
{
  "burstsOn": true,
  "burstPlacement": "chanceAfterMainStroke",
  "burstPercent": 25,
  ...
}
```

| `burstPlacement` | If omitted |
|----------------|------------|
| `sessionSpread` | **Default** (backward compatible) |
| `afterMainStroke` | Explicit |
| `chanceAfterMainStroke` | Explicit |

### 5.2 Layer checklist

| Layer | Change |
|-------|--------|
| `SomNet.Shared` | `BurstPlacement` enum (3 values); DTOs relay + motor |
| `SomNet.API` | Validator allows three strings when `burstsOn` |
| `SomNet.UI` | Dropdown, dynamic percent labels, preview + hints |
| `SomNet.Device` | Parse placement; plan kind + chance roll in `onRelayPulseComplete` path |
| Tests | §10 + seeded preview tests for chance |

---

## 6. UI / UX

### 6.1 Percent labels

| Placement | Label (example) |
|-----------|-------------------|
| `sessionSpread` | *Burst events spread across session (~% of session length)* |
| `afterMainStroke` | *Main strokes with burst after (~% of mains, evenly spaced)* |
| `chanceAfterMainStroke` | *Chance each main stroke is followed by a burst (%)* |

### 6.2 Warnings

| Condition | Message (example) |
|-----------|-------------------|
| `sessionSpread` + zero event count | *Schedules **0** bursts — raise % or lengthen session.* |
| `afterMainStroke` + high % + large burst stroke max | *Many long clusters — lower % or strokes per burst.* |
| `chanceAfterMainStroke` | *Burst count **varies each run**; ~% of mains long-term. Lower % for fewer clusters.* |
| `chanceAfterMainStroke` + preview graph | *Preview shows one **example** path; device rolls independently.* |

### 6.3 Pattern graph

- **`chanceAfterMainStroke` preview:** seeded roll per main stroke index (BP-D12); `illustrativeRandom: true` or placement-specific hint.
- **Live:** device segments reflect actual bursts only.

---

## 7. Operator examples

**Periodic, 4 s gap, 1 min, burst power 50%, 5–10 strokes/cluster, 1 s intra-gap:**

| Placement | % | Behavior |
|-----------|---|----------|
| `sessionSpread` | 50 | ~1 wall-clock cluster near **end of minute** |
| `afterMainStroke` | 50 | Burst after mains **2, 4, 6, …** (deterministic) |
| `chanceAfterMainStroke` | 50 | Each main stroke: **50% roll** for burst after; ~7–8 mains/min → often **3–5** bursts, sometimes **0** or **many** |

---

## 8. Motor (future — BP-D7)

Same three placements. **`chanceAfterMainStroke`:** after roll succeeds, ramp to burst duty for N micro-segments, then ramp back to program target.

---

## 9. Implementation phases

| Phase | Scope |
|-------|--------|
| **BP-A** | Shared enum (3) + API + UI types |
| **BP-B** | UI dropdown + labels/warnings + preview (incl. seeded chance) |
| **BP-C** | Relay firmware: three paths + chance roll |
| **BP-D** | Operator docs |
| **BP-E** | Motor M4 |

---

## 10. Test matrix (minimum)

| Placement | End | % | Expect |
|-----------|-----|---|--------|
| `sessionSpread` | minutes 1 | 25 | 0 events |
| `sessionSpread` | minutes 1 | 50 | 1 wall-clock burst |
| `afterMainStroke` | minutes 1 | 50 | Bursts after 2,4,6… |
| `chanceAfterMainStroke` | minutes 1 | 0 | Never bursts |
| `chanceAfterMainStroke` | minutes 1 | 100 | Burst after **every** main |
| `chanceAfterMainStroke` | strokes 20 | 50 | Statistical: ~10 bursts ± variance (Monte Carlo / seeded unit test) |
| `chanceAfterMainStroke` | noAutoEnd | 25 | Rolls on every main until stop |
| BP-D3 | strokes 2 | 100 chance | Burst after stroke 2, **then** end |
| `automatic-update` | chance | 50→10 mid-session | Past strokes unchanged; later rolls use 10% |

**Firmware unit idea:** mock `esp_random()` sequence → deterministic chance path.

---

## 11. Open items

- **Hard cap** on bursts per session — defer.
- **`resultJson`:** echo `burstPlacement`; optional `burstChanceRolls` / count only (tier 1 already has `burstEventsCompleted`).

---

## 12. References

- Phase 10 **rejected** Bernoulli for **`burstPercent` as event count** (P10-D1); **`chanceAfterMainStroke`** reintroduces Bernoulli **only** when placement explicitly selects it.
- Code: `automatic_burst_runtime.cpp`, `automatic_session_mode.cpp`, `relayBurstPlan.ts`
