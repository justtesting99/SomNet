# Burst placement modes — design (relay + motor)

**Status:** Implemented (2026-10-27) — firmware **`0.15.2-burst-main-timing`** (main+ vs instead-of-main), API, relay UI preview; motor UI mirrors placement fields (burst execution on motor device TBD per doc 31).  
**Parent:** [Phase 10 — Burst-in-automatic](./09-ESP32-Phase-10-Checklist.md) (signed off; behavior preserved as **session spread**)  
**Related:** [Frontend Architecture § Burst Settings](./03-Frontend-Architecture.md), [Motor actuator design § Bursts](./31-Motor-Actuator-Device-Design.md), [SignalR & Hardware](./06-SignalR-And-Hardware.md)

---

## 1. Problem statement

Phase 10 **`burstPercent`** answers: *“How many burst **events** fit in the session **envelope**, placed at equal spacing?”*  
That envelope is **minutes** (wall-clock), **strokes** (main-stroke count), or **unbounded** (`noAutoEnd` cadence).

Operators also want:

1. **Deterministic stroke share** — about **`percent`** of main **opportunities** on even spacing (stride or stroke milestones).
2. **Stochastic per stroke** — independent **`percent`** **chance** per main opportunity.
3. **Main timing** — burst **after** the main pulse (**main + burst**) vs **instead of** that main pulse (avoids back-to-back relay energize when the air tool needs return time).

This document adds **`burstPlacement`** (six UI values + three legacy wire aliases) so percent meaning and **main vs burst-on-beat** are explicit, with **UI warnings** and default **`mainPlusSessionSpread`** (Phase 10 spread semantics when legacy `sessionSpread` is omitted).

---

## 2. Locked product decisions (2026-10-27)

| ID | Decision |
|----|----------|
| **BP-D1** | **`burstPlacement`**: **six** operator values (§3) — main+ vs instead-of × three schedules. Legacy **`sessionSpread`** / **`afterMainStroke`** / **`chanceAfterMainStroke`** = **main+**. Default **`mainPlusSessionSpread`**. |
| **BP-D2** | **Even** and **chance** schedules use **stroke-based** evaluation only for stride/milestones/rolls. **No** wall-clock burst timers for those schedules. Applies to **all** `endSessionMode` values (including **minutes**). **Spread** schedule keeps Phase 10 wall-clock for **minutes**. |
| **BP-D13** | **Main +** runs burst **after** main pulse completes (or between mains for spread+minutes). **Instead of main** runs burst **before** the scheduled main pulse (`shouldTriggerBurstBeforeMainStroke`); that beat has **no** main pulse. |
| **BP-D3** | **End session after a burst:** if a burst triggers on the same main-stroke completion as an end rule, **run the burst cluster first**, then end the session. |
| **BP-D4** | **Load mitigation:** UI encourages **lower `burstPercent`** for stroke-linked placements; extra copy for **`chanceAfterMainStroke`** (unpredictable cluster count). No hard firmware cap in v1 beyond burst stroke min/max. |
| **BP-D5** | **`burstPercent` label and hint depend on `burstPlacement`** from first paint. |
| **BP-D6** | **Relay:** firmware + preview graph + live segments for all **six** placements (implemented **`0.15.2-burst-main-timing`**). |
| **BP-D7** | **Motor:** same DTO/settings + UI; firmware **M4** — burst = short speed/duty dip (ramp) then resume program (§8). |
| **BP-D8** | **`automatic-update`:** deterministic schedules **replan** (§4.6). **Chance** only changes **future** rolls (no retroactive changes on past strokes). **Main-timing** flag follows new placement on replan. |
| **BP-D9** | **Docs + tests** per §10. |
| **BP-D10** | **Spread** keeps Phase 10 rounding. **Even** uses stride/milestones (§4.2). **Chance** uses per-opportunity roll (§4.3) — **0** never bursts; **100** always bursts on every opportunity (main+ = after every main; instead-of = every beat is burst). |
| **BP-D11** | **Chance roll (device):** `(esp_random() % 100) < burstPercent`. **Not** Phase 10 event-count percent. Evaluated **after** main (main+) or **before** next main (instead-of). |
| **BP-D12** | **Preview graph:** seeded PRNG per `(session seed, mainStrokeIndex)` so idle preview is **repeatable**; label as illustrative for chance mode. **Live** graph uses device segments only (actual rolls). |

---

## 3. Placement modes (operator-facing)

Each row is one **schedule** (what percent means). The UI exposes **six** dropdown values: **main + burst** vs **burst instead of main** for each schedule.

| UI label | JSON `burstPlacement` | Timing |
|----------|-------------------------|--------|
| Main + spread across session | `mainPlusSessionSpread` | Main pulse, then burst when schedule fires (minutes: between mains on wall-clock). |
| Burst instead of main — spread | `insteadOfSessionSpread` | Burst **replaces** the scheduled main on that beat (no main pulse first). |
| Main + after main strokes (even) | `mainPlusAfterMainStroke` | Main completes, then burst on stride/milestones. |
| Burst instead of main — even spacing | `insteadOfAfterMainStroke` | Burst **instead of** the main on stride/milestones (air-tool return time). |
| Main + chance after each main | `mainPlusChanceAfterMainStroke` | Main completes, then independent % roll for burst. |
| Burst instead of main — chance | `insteadOfChanceAfterMainStroke` | Roll before each main opportunity; burst **or** main, not both. |

**Legacy wire values** (still accepted): `sessionSpread`, `afterMainStroke`, `chanceAfterMainStroke` — treated as **main +** variants.

| Schedule | **Percent (0–100)** meaning |
|----------|------------------------------|
| **Spread** (`*SessionSpread`) | Phase 10: burst event count ≈ `round(envelope × percent / 100)`, evenly spaced. |
| **Even** (`*AfterMainStroke`) | About **percent** of main **opportunities** on even spacing (stride or stroke milestones). |
| **Chance** (`*ChanceAfterMainStroke`) | Independent **percent** chance per main **opportunity**. |

**Default:** `mainPlusSessionSpread`.

**When `burstsOn` is false:** `burstPlacement` is ignored (still round-trips in settings).

**Not confused with `burstStyle`:** `randomPowerOnly` / `randomDelayOnly` only randomize **inside** a burst cluster (power/delay). **Chance** schedules randomize **whether** a burst cluster runs on a given main **opportunity** (main+ = after main; instead-of = instead of main).

---

## 4. Execution semantics (relay firmware)

Shared: burst sub-FSM (Phase 10 §2.1–2.2), `strokesCompleted_` / `mainStrokesCompleted` excludes intra-burst strokes, stop/abort unchanged. Plan field **`burstInsteadOfMain`** set from placement at session start / replan.

**Code:** `automatic_burst_runtime.cpp` (`buildAutomaticBurstPlan`, `shouldTriggerBurstAfterMainStroke`, `shouldTriggerBurstBeforeMainStroke`), `automatic_session_mode.cpp` (`poll` before `startNextPulse`, `onRelayPulseComplete`).

### 4.1 Spread schedule (`*SessionSpread`)

| `endSessionMode` | Burst plan kind | Trigger (main+) | Trigger (instead-of) |
|------------------|-----------------|-----------------|----------------------|
| `minutes` | `WallClockDeadlines` | `WaitingGap` wall-clock deadline (between mains) | Same — no main pulse on that beat |
| `strokes` | `StrokeMilestones` | After main when `mainStrokesCompleted >= milestone[k]` | Before main when `mainStrokesCompleted + 1 >= milestone[k]` |
| `noAutoEnd` | `CadenceStride` | After main when `mainStrokesCompleted >= nextCadenceTriggerStroke` | Before main when `mainStrokesCompleted + 1 >= nextCadenceTriggerStroke` |

Formulas: [Phase 10 §3.6](./09-ESP32-Phase-10-Checklist.md).

### 4.2 Even schedule (`*AfterMainStroke`)

| `endSessionMode` | Burst plan kind | Main+ trigger | Instead-of trigger |
|------------------|-----------------|---------------|-------------------|
| `minutes` | `CadenceStride` | After main: `mainStrokesCompleted >= nextCadenceTriggerStroke` | Before main: `mainStrokesCompleted + 1 >= nextCadenceTriggerStroke` |
| `strokes` | `StrokeMilestones` | After milestone main index | Before that main index |
| `noAutoEnd` | `CadenceStride` | P10-D19 stride (after) | Same stride (before) |

```text
stride = (100 + burstPercent / 2) / burstPercent   // integer, min 1 when percent > 0
```

Stroke end mode:

```text
burstEventCount = round(endSessionValue × burstPercent / 100)
milestone k: main stroke index = (k × endSessionValue) / burstEventCount
```

**Minutes:** session ends on clock; bursts only when stride hits between mains. **BP-D3** at last stroke before minute elapses.

### 4.3 Chance schedule (`*ChanceAfterMainStroke`)

**No milestone table.** Per main **opportunity** (all `endSessionMode` values):

```text
if burstPercent >= 100 → trigger burst
else if burstPercent <= 0 → no burst
else if (esp_random() % 100) < burstPercent → trigger burst
else → no burst
```

- **Main+:** roll in **`onRelayPulseComplete`** after main pulse (`shouldTriggerBurstAfterMainStroke`).
- **Instead-of:** roll in **`poll()`** before **`startNextPulse`** (`shouldTriggerBurstBeforeMainStroke`); on success, main pulse skipped.

Then apply **BP-D3** when burst triggers on an end-rule beat.

**Properties:**

- Independent rolls per opportunity (memoryless).
- Long-run frequency ≈ `burstPercent / 100`; short sessions high variance.
- **Wall-clock end:** only opportunities that occur before the minute ends are rolled.

**`burstPlan.kind`:** **`ChancePerMainStroke`**. Serial may log `[AUTO] burst timing=insteadOfMain` when applicable.

### 4.4 Main timing (main+ vs instead-of)

| Timing | Firmware trigger point |
|--------|-------------------------|
| **Main +** (`burstInsteadOfMain = false`) | After main pulse in **`onRelayPulseComplete`** (`shouldTriggerBurstAfterMainStroke`). |
| **Instead of main** (`burstInsteadOfMain = true`) | Before **`startNextPulse`** in **`poll()`** (`shouldTriggerBurstBeforeMainStroke`); main pulse is skipped on that beat. |

Wall-clock **session spread** (minutes) still uses **`shouldTriggerBurstInWaitingGap`** for both timings (burst between mains, not stacked on a main pulse).

### 4.5 End session vs burst (BP-D3)

On **`onRelayPulseComplete`** (main+ only):

1. Increment `mainStrokesCompleted`.
2. Apply pending `automatic-update`.
3. If `burstsOn` && **main+** placement triggers → `beginBurstEvent()`; **return**.
4. Stop / end-session checks.

**`poll()` `WaitingGap`:** wall-clock bursts for **session spread + minutes**; **instead-of** stroke/chance modes call **`shouldTriggerBurstBeforeMainStroke`** before the next main pulse.

After **`finishBurstEvent()`**, run stop/end checks.

### 4.6 Mid-session replan (Phase 11)

| Schedule basis | Replan behavior |
|----------------|-----------------|
| **Spread** | `buildAutomaticBurstPlanForReplan` (wall-clock offsets + milestone advance) |
| **Even** | Rebuild milestones/stride from remaining stroke budget + advance past completed |
| **Chance** | Update `burstPercent` / placement / **main-timing** in config only; **do not** re-roll past strokes; next opportunity uses new settings |

---

## 5. Wire format & shared layers

### 5.1 JSON

```json
{
  "burstsOn": true,
  "burstPlacement": "insteadOfAfterMainStroke",
  "burstPercent": 50,
  ...
}
```

| `burstPlacement` | If omitted |
|------------------|------------|
| *(omitted)* | Firmware defaults **`sessionSpread`** (= main+ spread, Phase 10 compatible) |
| `mainPlusSessionSpread` | Explicit default for new UI saves |
| `insteadOfSessionSpread` … `insteadOfChanceAfterMainStroke` | Explicit instead-of variants |
| Legacy `sessionSpread` / `afterMainStroke` / `chanceAfterMainStroke` | Parsed as **main+** for that schedule |

### 5.2 Layer checklist (implemented)

| Layer | Delivered |
|-------|-----------|
| `SomNet.Shared` | `BurstPlacement` enum (9 wire values); DTOs relay + motor; JSON camelCase |
| `SomNet.API` | `HardwareCommandPayloadValidator` — all placement strings when `burstsOn` |
| `SomNet.UI` | Six-option dropdown (`burstPlacement.ts`), dynamic percent labels, schedule hints, graph preview (main+ vs instead-of) |
| `SomNet.Device` | `parseBurstPlacement`; `burstInsteadOfMain` on plan; before/after main trigger paths |
| Tests | `relayBurstPlan.test.ts`, `relayPowerSchedule.test.ts`, `HardwareCommandPayloadValidatorBurstPlacementTests.cs` |

---

## 6. UI / UX

### 6.1 Percent labels

Labels come from `burstPercentFieldLabel()` — depend on **schedule** (spread / even / chance), not main-timing.

### 6.2 Warnings & hints

| Condition | UI behavior |
|-----------|-------------|
| Spread + zero event count | Schedule hint: raise % or lengthen session |
| Even + high % + large burst max | Hint: many long clusters — lower % or strokes per burst |
| Chance | Amber copy: count varies each run |
| **Instead-of** any schedule | Slate copy: burst replaces scheduled main (air-tool return) |
| Chance + preview graph | Preview uses seeded rolls; device uses `esp_random()` |

### 6.3 Pattern graph

- **`chanceAfterMainStroke` preview:** seeded roll per main stroke index (BP-D12); `illustrativeRandom: true` or placement-specific hint.
- **Live:** device segments reflect actual bursts only.

---

## 7. Operator examples

**Periodic, 4 s gap, 1 min, burst power 50%, 5–10 strokes/cluster, 1 s intra-gap:**

| Placement | % | Behavior |
|-----------|---|----------|
| `mainPlusSessionSpread` | 50 | ~1 wall-clock cluster near **end of minute** (between mains) |
| `mainPlusAfterMainStroke` | 50 | Main pulse, **then** burst after mains **2, 4, 6, …** |
| `insteadOfAfterMainStroke` | 50 | Burst **on** beats 2, 4, 6, … **with no main pulse** on those beats |
| `mainPlusChanceAfterMainStroke` | 50 | After each main: **50% roll** for burst cluster |
| `insteadOfChanceAfterMainStroke` | 50 | Each beat: **50% roll** for burst **or** main, not both |

---

## 8. Motor (future — BP-D7)

UI + DTO store all **six** placements (same dropdown as relay). **Relay firmware** executes placement; **motor automatic** does not run burst FSM yet ([doc 31](./31-Motor-Actuator-Device-Design.md)).

---

## 9. Implementation status

| Phase | Scope | Status |
|-------|--------|--------|
| **BP-A** | Shared enum + API + UI types | ☑ |
| **BP-B** | Six-option dropdown + labels/warnings + preview | ☑ |
| **BP-C** | Relay firmware: three schedules × main+ / instead-of | ☑ **`0.15.2-burst-main-timing`** |
| **BP-D** | Operator + dev docs (this file, Phase 10 follow-on, device plan) | ☑ 2026-10-27 |
| **BP-E** | Motor M4 burst execution | ☐ |

---

## 10. Test matrix (minimum)

| Placement | End | % | Expect |
|-----------|-----|---|--------|
| `sessionSpread` | minutes 1 | 25 | 0 events |
| `sessionSpread` | minutes 1 | 50 | 1 wall-clock burst |
| `mainPlusAfterMainStroke` | minutes 1 | 50 | Bursts after mains 2,4,6… |
| `insteadOfAfterMainStroke` | minutes 1 | 50 | Bursts **on** 2,4,6… **without** main on those beats |
| `mainPlusChanceAfterMainStroke` | minutes 1 | 0 | Never bursts |
| `mainPlusChanceAfterMainStroke` | minutes 1 | 100 | Burst after **every** main |
| `insteadOfChanceAfterMainStroke` | minutes 1 | 50 | ~50% of beats are burst-only (no main on those beats) |
| `mainPlusChanceAfterMainStroke` | strokes 20 | 50 | Statistical: ~10 bursts ± variance (seeded unit test) |
| BP-D3 | strokes 2 | 100 main+ chance | Burst after stroke 2, **then** end |
| `automatic-update` | chance | 50→10 mid-session | Past strokes unchanged; later rolls use 10% |

**Firmware unit idea:** mock `esp_random()` sequence → deterministic chance path.

---

## 11. Open items

- **Hard cap** on bursts per session — defer.
- **`resultJson`:** echo `burstPlacement`; optional `burstChanceRolls` / count only (tier 1 already has `burstEventsCompleted`).

---

## 12. References

- Phase 10 **rejected** Bernoulli for **`burstPercent` as event count** (P10-D1); **`chanceAfterMainStroke`** reintroduces Bernoulli **only** when placement explicitly selects it.
- Code: `SomNet.Device` — `automatic_burst_runtime.*`, `automatic_config.*`, `automatic_session_mode.cpp`; `SomNet.UI` — `burstPlacement.ts`, `relayBurstPlan.ts`, `relayPowerSchedule.ts`; `SomNet.API` — `HardwareCommandPayloadValidator.cs`; `SomNet.Shared` — `Enums/BurstPlacement.cs`
