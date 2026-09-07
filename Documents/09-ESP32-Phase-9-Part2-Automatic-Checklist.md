# Phase 9 Part 2 — Automatic mode checklist

**Status:** UI rules + §6 implementation complete (2026-09-07). Firmware and Start/Stop wiring **not started**. Assumes **Burst Settings unchecked** (`burstsOn: false`) unless noted.

| Related | Link |
|---------|------|
| Parent sign-off | [09-ESP32-Phase-9-Checklist.md](./09-ESP32-Phase-9-Checklist.md) Part 2 |
| Device execution | [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §6 |
| UI component | `SomNet.UI/src/components/modes/AutomaticControls.tsx` |
| Shared state | `AutomaticControlState` / `AutomaticControlStateDto` |

**Reference pattern:** Manual **burst** = N strokes × fixed `strokeMs` + fixed gap between strokes. Automatic modes (bursts off) = **indefinite single strokes** until stop/end-session/abort, with power and/or gap chosen per mode below.

---

## 1. Automatic mode program catalog

The **Automatic Mode** dropdown selects a **program variation**. Only **Power Settings** and **Timing Settings** panels change which controls are enabled; all other Automatic tab areas (End Session, Burst Settings, Start/Stop) follow separate rules (see §4).

| # | Display label | Proposed enum (`AutomaticRunMode`) | Min power disabled | Min interval (sec) disabled |
|---|---------------|-------------------------------------|--------------------|-----------------------------|
| 1 | Periodic | `periodic` | ☑ | ☑ |
| 2 | Random Power Only | `randomPowerOnly` | ☐ | ☑ |
| 3 | Random Timing Only | `randomTimingOnly` | ☑ | ☐ |
| 4 | Random Power and Timing | `randomPowerAndTiming` | ☐ | ☐ |
| 5 | Power Wave | `powerWave` | ☐ | ☑ |
| 6 | Power and Timing Wave | `powerAndTimingWave` | ☐ | ☐ |
| 7 | Build-Up | `buildUp` | ☐ | ☐ |

**UI field mapping**

| User-facing control | State key | Panel |
|---------------------|-----------|--------|
| Minimum (power slider) | `minimumPower` | Power Settings |
| Minimum (sec) time between strokes | `strokeMinSeconds` | Timing Settings |

When a control is **disabled**, it is greyed out and not editable. **Maximum** power and **maximum** inter-stroke seconds remain enabled in all modes unless another rule applies (e.g. session running).

---

## 2. Simplified rule (implementation)

Two independent toggles derived from `automaticMode`:

```
disableMinimumPower     = mode ∈ { periodic, randomTimingOnly }
disableStrokeMinSeconds = mode ∈ { periodic, randomPowerOnly, powerWave }
```

No other combinations disable these two fields. Modes **Random Power and Timing**, **Power and Timing Wave**, and **Build-Up** enable both minimum controls.

**End Session — third UI rule from `automaticMode`:**

```
disableNoAutoEnd = mode ∈ { buildUp, powerWave, powerAndTimingWave }
```

**Helper (UI):** e.g. `getAutomaticFieldRules(automaticMode)` → `{ disableMinimumPower, disableStrokeMinSeconds, disableNoAutoEnd }`.

---

## 3. Execution semantics (bursts off)

Each automatic session loop (simplified):

```
wait gap → pick power% → map to strokeMs → single relay pulse → repeat until stop / end rule / abort
```

Power maps to pulse length via `strokeMsFromPower(power, minimumStrokeMs, maximumStrokeMs)` (device-side, same as manual). **All timing runs on the ESP32** after one `automatic-start` payload (P9-D2 immediate ack).

| Mode | Power each stroke | Gap before next stroke | Disabled UI mins imply |
|------|-------------------|------------------------|-------------------------|
| **Periodic** | Fixed — use **maximum power** (min power UI disabled) | Fixed — **`strokeMaxSeconds`** only (min sec disabled) | No randomization; like burst spacing but **one stroke per cycle** and **unlimited** repetitions |
| **Random Power Only** | Uniform random in **[minPower, maxPower]** | Fixed — **`strokeMaxSeconds`** (same as Periodic) | Random strength, steady cadence |
| **Random Timing Only** | Fixed — **maximum power** (min power disabled) | Uniform random in **[strokeMinSeconds, strokeMaxSeconds]** | Steady strength, random cadence; like burst **variable gaps** but single stroke each time |
| **Random Power and Timing** | Uniform random in **[minPower, maxPower]** | Uniform random in **[strokeMinSeconds, strokeMaxSeconds]** | Full random (current plan §6 default mental model) |
| **Power Wave** | **Pre-computed periodic** triangle/sine between min↔max (`T_wave = 2×T_rise`) | Fixed — **`strokeMaxSeconds`** | Index `schedule[i]` each stroke |
| **Power and Timing Wave** | **Pre-computed periodic** power wave | **Pre-computed inverse** gap wave | Both in `schedule[i]` |
| **Build-Up** | **Pre-computed half-wave** ramp min → max | **Pre-computed inverse** ramp max gap → min | Single ramp over session; no repeat |

### Mode relationships (building blocks)

```
Periodic          = fixed power (max) + fixed gap (max sec)
Random Power Only = Periodic gap     + random power
Random Timing Only= Periodic power   + random gap
Random P+T        = random power     + random gap

Power Wave        = fixed gap + **periodic** power wave (triangle/sine)
P+T Wave          = **periodic** inverse power + gap waves
Build-Up          = **half-wave** ramp only (min→max power, max→min gap over session)
```

### Waveform pre-computation (wave + build-up)

Wave and build-up modes **do not** pick power/gap from a live formula on every stroke alone. At **`automatic-start`**, firmware **pre-computes a schedule in memory** — an array of **`(powerPercent, gapSec)`** (or stroke index → sample) for the session — then the run loop **indexes through that table** each stroke.

**Shared wave timing math (Power Wave + P+T Wave):**

| Symbol | Meaning |
|--------|---------|
| **`T_rise`** | Time to go from **min → max power** (ascending leg to peak) — the operator’s **defined time** (from End Session — see P9P2-D23) |
| **`T_wave`** | **Full power wave period** = **`2 × T_rise`** (min → max → min, one triangle/sine cycle) |
| **`T_mid`** | Midpoint of ascending leg = **`T_rise / 2`** (power halfway between min and max settings) |

```
Power (triangle)     max ┤      ╱╲      ╱╲
                        │     ╱  ╲    ╱  ╲
                   mid ┤    ╱    ╲  ╱    ╲
                        │   ╱      ╲╱      ╲
                   min ┤──╱──────────────────╲──
                        0   T_mid  T_rise     T_wave (= 2×T_rise)
                              ↑ periodic repeat →
```

1. Derive **`T_rise`**, **`T_wave`**, **`T_mid`** from End Session + mode rules (P9P2-D23).  
2. Estimate or iterate **stroke count** until session end (minutes or stroke limit).  
3. For each stroke index **`i`**, compute elapsed **`t`** in the current wave cycle:  
   `t = (i × gapSec) mod T_wave` (time-based) or map stroke index → phase (stroke-based).  
4. Sample **triangle or sine** (P9P2-D8) for **power** between `minimumPower` and `maximumPower`.  
5. **Power Wave:** **`gapSec` fixed** at `strokeMaxSeconds`.  
6. **P+T Wave:** sample **inverse** triangle/sine for **gap** between `strokeMinSeconds` and `strokeMaxSeconds` (power at max → gap at min, and vice versa — P9P2-D15).  
7. Store **`schedule[i] = (power, gapSec)`**; execution loop uses **`schedule[i]`** only.

**Build-Up = half-wave only**

One **ascending half-triangle** (no descent, no repeat) over the **full End Session** envelope:

| Axis | Start (`t=0`) | End (`t=1`) |
|------|---------------|-------------|
| Power | min | max |
| Gap (sec) | max | min (inverse) |

Pre-compute the same way: N steps from 0→1, store ramp table, index until session completes.

**Periodic / random modes:** no pre-compute table — sample per stroke (RNG or fixed) as today.

### Build-Up intent

**Operator feel:** early strokes are **low power** and **long gaps** (min power, max time between strokes); progression toward **high power** and **short gaps** (max power, min time between strokes).

```
Session start ──►  low power, long wait  ──►  … ramp …  ──►  high power, short wait
                  (minPower, strokeMaxSeconds)              (maxPower, strokeMinSeconds)
```

### Wave modes — inverse coupling (P+T Wave + build-up)

For **Power and Timing Wave**, gap wave is **inverse** to power (180° out of phase on the same triangle/sine shape):

| Power phase | Gap phase |
|-------------|-----------|
| Toward **min** power | Toward **max** sec |
| Toward **max** power | Toward **min** sec |

**Build-Up** uses the same inverse relationship but **monotonic** (half-wave only, no oscillation).

### ASCII — session loop (all modes, bursts off)

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│ delayBefore │────►│  wait gap    │────►│ pick power  │────►│  pulse   │──┐
│   Start     │     │ (mode logic) │     │ → strokeMs  │     │ (relay)  │  │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────┘  │
       ▲                                                                    │
       └──────────────── end rule / stop / abort ──────────────────────────┘
```

### Burst Settings (`burstsOn`) — deferred

When **Bursts On** is checked, behavior is **additive** on top of the selected mode (P9-D6 deferred). Part 2 sign-off assumes **`burstsOn: false`**. Revisit burst-in-automatic after base seven modes work.

### Session envelope + End Session (wave / build-up)

**Why `noAutoEnd` is disabled** for build-up and both wave modes (P9P2-D20): a **defined duration or stroke count** is required to build the pre-computed schedule.

| Mode | Role of End Session (`minutes` / `strokes` + value) |
|------|------------------------------------------------------|
| **Build-Up** | **Total session** = one **half-wave** ramp (min→max power, max→min gap). Pre-compute N steps over full envelope; stop when complete. |
| **Power Wave** | **Total session** length; **`T_rise`** derived from End Session (P9P2-D23). **Periodic** power triangle/sine repeats every **`T_wave = 2×T_rise`** until session ends. Gap fixed at max sec. |
| **Power and Timing Wave** | Same as Power Wave, plus **inverse periodic gap** wave; both axes pre-computed per stroke. |
| **Periodic / Random\*** | End Session = stop rule only; **`noAutoEnd` allowed.** |

**End Session mapping for wave modes (P9P2-D23 — confirm with original product):**

| Option | Meaning |
|--------|---------|
| **A (proposed)** | End Session **minutes** value = **`T_rise`**; total session wall time = **`2 × endSessionValue`** minutes (one full wave then stop) |
| **B** | End Session = **total session**; **`T_rise = endSessionValue / 2`** (one wave fits exactly in session) |
| **C** | End Session = **stroke count**; pre-compute that many `(power, gap)` samples along **repeating** wave phase |

Stroke-based End Session fits **pre-compute N rows** naturally (option C). Minutes-based needs average gap or iterative fill to estimate N.

**Execution loop (wave / build-up):**

```text
on automatic-start:
  schedule[] = buildWaveformSchedule(config)   // § waveform pre-computation

on each stroke i:
  (power, gapSec) = schedule[i]   // or schedule[i mod len] for repeating wave within longer session
  strokeMs = strokeMsFromPower(power, minStrokeMs, maxStrokeMs)
  pulse; wait gapSec
  if session end rule (minutes / strokes / stop / abort):
      stop + summary ack
```

**UI — End Session for wave / build-up:**

| Automatic mode | **`noAutoEnd` option** |
|----------------|-------------------------|
| Periodic, Random\* | Enabled |
| **Build-Up**, **Power Wave**, **Power and Timing Wave** | **Disabled** |

When switching into wave/build-up while `noAutoEnd` selected → coerce to **`minutes`** (P9P2-D22).

**UI hint (optional):** *“Wave/build-up schedule is pre-calculated for this duration or stroke count.”* (P9P2-D17)

---

## 4. Decisions (lock before UI / firmware merge)

| # | Decision | Options | Choice | Date |
|---|----------|---------|--------|------|
| P9P2-D1 | **Enum values** | Add 6 new values to match table above / different naming | ☐ **Proposed:** camelCase strings in JSON (`periodic`, `randomPowerOnly`, …) aligned with `SomNet.Shared.Enums.AutomaticRunMode` | |
| P9P2-D2 | **Disabled field values** | Keep last user value / force min = max when disabled / reset to default | ☐ **Proposed:** keep stored value; **firmware ignores** disabled min fields and uses fixed max (power or interval) per §3 | |
| P9P2-D3 | **Change mode while `running`** | Block dropdown / allow but don’t apply until stop / apply live | ☐ **Proposed:** dropdown disabled while `running` | |
| P9P2-D4 | **`automatic-start` payload** | Always send min fields / omit when disabled / send + `automaticMode` only | ☐ **Proposed:** full snapshot + `automaticMode`; device applies §3 rules | |
| P9P2-D5 | **Periodic — fixed power level** | Max power only / min power / last slider / operator max | ☐ **Proposed:** **maximum power** when min power disabled | 2026-09-06 |
| P9P2-D6 | **Periodic / Random Power Only / Power Wave — fixed gap** | `strokeMaxSeconds` only / average of min+max | ☐ **Proposed:** **`strokeMaxSeconds`** when min sec disabled | 2026-09-06 |
| P9P2-D7 | **Random Timing Only — fixed power** | Max power / min power | ☐ **Proposed:** **maximum power** when min power disabled | 2026-09-06 |
| P9P2-D8 | **Wave shape** | Sine / triangle / linear ramp segments | ☐ **Proposed:** triangle default on MCU; sine optional | |
| P9P2-D9 | **Wave period** | Single cycle / repeating / End Session only | ☑ **`T_wave = 2 × T_rise`**; **periodic repeat** until session end; pre-computed schedule (§3) | 2026-09-06 |
| P9P2-D10 | **Build-Up curve** | Linear / ease-in / half triangle | ☑ **Half-wave only** (ascending ramp); linear unless original product specifies ease | 2026-09-06 |
| P9P2-D11 | **Build-Up reset** | Once per session / repeat | ☑ **Once per session** — single half-wave table | 2026-09-06 |
| P9P2-D12 | **Power vs timing coupling (wave + build-up)** | Independent ramps / **inverse** (power ↑ gap ↓) | ☐ **Proposed:** **inverse** for Build-Up and P+T Wave unless original product says otherwise (P9P2-D15) | 2026-09-06 |
| P9P2-D13 | **Burst Settings panel** | Part 2 / Part 3 / defer | ☑ **Part 3** — burst-in-auto (% of session, own dropdown modes); **out of scope** for Part 2 | 2026-09-06 |
| P9P2-D14 | **End Session panel** | Unaffected by mode dropdown | ☑ **Partial:** **`noAutoEnd` disabled** for build-up + both wave modes; minutes/strokes required (§3) | 2026-09-06 |
| P9P2-D15 | **Inverse wave phasing** | 180° out of phase / independent | ☑ **180° inverse** for P+T Wave (same triangle/sine shape, gap inverted) | 2026-09-06 |
| P9P2-D16 | **Build-Up duration** | Full session / other | ☑ **End Session envelope = full half-wave** | 2026-09-06 |
| P9P2-D17 | **Tooltip on disabled min fields** | None / short hint (“Not used in Periodic mode”) | ☑ **Visible helper text** under disabled min power / min gap; mode summary in Controls panel | 2026-09-07 |
| P9P2-D18 | **Disable timing fields while running** | All config read-only / editable with live update | ☑ **Part 2:** read-only while running (banner + all fields); **future §9** allows edit + `automatic-update` | 2026-09-07 |
| P9P2-D19 | **Stroke-based `t` formula** | `n/N` / `(n-1)/(N-1)` at last stroke | ☐ **Proposed:** reach `t=1` on **last** of N strokes: `(strokeCount-1)/(N-1)` for N>1 | |
| P9P2-D20 | **`noAutoEnd` + wave/build-up** | Allow / **disable option in UI** | ☑ **Disable `noAutoEnd`** for `buildUp`, `powerWave`, `powerAndTimingWave` | 2026-09-06 |
| P9P2-D21 | **Wave repetition** | Single cycle / repeat until session end | ☑ **Periodic repeat** (`T_wave = 2×T_rise`); session stops on End Session rule | 2026-09-06 |
| P9P2-D22 | **Switch to wave/build-up while `noAutoEnd` selected** | Coerce to `minutes` / block | ☐ **Proposed:** auto-switch to **`minutes`** + keep `endSessionValue` | |
| P9P2-D23 | **End Session → `T_rise` mapping (wave modes)** | A: value=`T_rise` / B: total session / C: stroke count table | ☐ TBD — see §3 options A/B/C; **stroke count (C)** fits pre-compute naturally | |
| P9P2-D24 | **Pre-compute location** | Device at start / UI sends table / hybrid | ☐ **Proposed:** **device** builds schedule at `automatic-start` (keeps execution on ESP32) | |
| P9P2-D25 | **Wave sample shape** | Triangle / sine | ☐ **Proposed:** triangle default; sine optional (P9P2-D8) | |
| P9P2-D26 | **Planner vs sequencer split** | Monolithic FSM / **planner + sequencer FSM** | ☑ **Planner at start + sequencer in `poll()`** — see §8 (all automatic modes) | 2026-09-06 |
| P9P2-D27 | **Dedicated OS scheduler for stroke timing** | FreeRTOS timer task / **sequencer FSM + `millis()`** | ☑ **Sequencer FSM** for Part 2; not a separate scheduler task | 2026-09-06 |
| P9P2-D32 | **Automatic firmware class split** | Monolithic mode / **session shell + program subclasses** | ☑ **`AutomaticSessionMode` + `AutomaticProgramBase` subclasses + factory** (§8) | 2026-09-07 |
| P9P2-D33 | **Seven `IExecutionMode` classes** | One per program / **one automatic mode only** | ☑ **One** `AutomaticSessionMode` on `IExecutionMode`; programs are **not** top-level modes | 2026-09-07 |
| P9P2-D34 | **Program lifecycle hooks** | Virtual only / **subclass + session callbacks** | ☑ **Subclasses** for `buildPlan`; **session mode** owns FSM, relay, hub ack via callbacks/context | 2026-09-07 |

---

## 8. Architecture — planner + stroke sequencer (automatic timing)

**Question (general):** After calculating wave/build-up/random **data points**, how should firmware **send / fire strokes** on time? Do we need a **scheduler**?

**Answer:** You need a **stroke sequencer** (deadline-driven executor), not a separate OS scheduler or server-driven ticks. SomNet already uses this pattern for any “wait, then act” device timing — automatic mode applies it to **every** program (periodic, random, wave, build-up).

### Two layers (all automatic modes)

| Layer | When | Job |
|-------|------|-----|
| **1. Planner** | Once at `automatic-start` | Turn config into **what** each stroke is: `schedule[i] = (power, gapSec, strokeMs)` — from pre-computed table, RNG seed plan, or parametric wave |
| **2. Sequencer** | Every `loop()` → `AutomaticSessionMode::poll()` | Turn plan into **when** strokes fire: wait gap → pulse → wait → next index |

The **sequencer is the “scheduler”** in embedded terms: it does not recalculate the wave; it **plays back** the plan on **`millis()` deadlines**.

### Sequencer FSM (applies to periodic, random, wave, build-up)

```
StartDelay → WaitingGap → Pulse → (relay off callback) → WaitingGap → … → SessionComplete
```

| State | Responsibility |
|-------|----------------|
| **StartDelay** | Wait `delayBeforeStartSeconds` |
| **WaitingGap** | Until `millis() >= nextDeadline`, use `schedule[i].gapSec` (from plan) |
| **Pulse** | `relay->requestPulse(strokeMs)` — **`relay_controller`** owns GPIO pulse width |
| **Between strokes** | `relay_controller.poll()` runs in main loop (same as manual/burst today) |

**Trigger rule:** if relay **idle** and **now ≥ nextDeadline** → load row **`i`** from plan → start pulse → on complete, set **`nextDeadline = now + gapSec`**, **`i++`**, check end-session.

```text
automatic-start:
  plan = buildPlan(payload)     // planner: all modes

each poll() [AutomaticSessionMode]:
  if state == WaitingGap && now >= nextDeadline && !relay.active:
      row = plan[i]             // or sample row on the fly for parametric waves
      relay.requestPulse(row.strokeMs, …)
      state = Pulse
  if state == Pulse:
      relay_controller.poll()   // elsewhere in loop — turns relay off at strokeMs
  on pulse complete:
      nextDeadline = millis() + row.gapSec * 1000
      i++; checkEndSession()
```

**Periodic / random:** planner fills each row differently (fixed max, uniform random, etc.) — **same sequencer**.

**Wave / build-up:** planner fills table or parametric sampler — **same sequencer**.

### Planner output shapes

| Shape | Modes | Sequencer reads |
|-------|-------|-----------------|
| **Full `schedule[]`** | Build-up, stroke-count end, short sessions | `plan[i]` directly |
| **Parametric + stroke index** | Long minute sessions, repeating waves | `sampleWave(i or elapsed)` each stroke before pulse |
| **On-the-fly random** | Random power/timing | `random()` when advancing `i` (no table; planner = bounds only) |

### What you do **not** need

- Separate FreeRTOS scheduler / timer task for Part 2  
- API or UI sending one message per stroke  
- Blocking `delay()` between strokes  
- `esp_timer` per gap (optional later for ±ms gap precision — Phase 7 §G2)

**Division of labour:** sequencer = **when** + **which row**; `relay_controller` = **how long** relay stays on for that row.

### Modular class layout (locked — P9P2-D32–D34)

**Goal:** Avoid a monolithic `AutomaticSessionMode` that grows every time a program is added. **One hub-facing mode**; **subclassed programs** for mode-specific logic; **callbacks** for shared lifecycle hooks (project convention).

**Do not** register seven separate `IExecutionMode` implementations — `execution_context` still holds **one** `AutomaticSessionMode` for `automatic-start` / `automatic-stop` (same command key as today).

```
execution_context
    └── AutomaticSessionMode          ← only IExecutionMode; FSM + hub + session
            │
            ├── owns AutomaticProgram*   ← factory from automaticMode enum
            │
            └── AutomaticProgramBase     ← abstract program (subclass per catalog entry)
                    ├── PeriodicProgram
                    ├── RandomProgram      (power / timing / both via flags or subclasses)
                    ├── WaveProgram        (power-only vs P+T inverse)
                    └── BuildUpProgram
```

| Class / module | Responsibility | Changes when adding program #8 |
|----------------|----------------|--------------------------------|
| **`AutomaticSessionMode`** | Sequencer FSM, relay, end-session, abort, ack/`resultJson`, session counters, future `automatic-update` | **None** (or factory registration only) |
| **`AutomaticProgramBase`** | Virtual **`buildPlan()`**; optional **`strokeAt(i)`** for parametric rows; config validation | Unchanged |
| **`PeriodicProgram`**, etc. | Mode-specific plan / wave math only | **New subclass file** + factory case |
| **`automatic_program_factory.*`** | `create(AutomaticRunMode)` → `AutomaticProgram*` | One `case` + `#include` |

**Callbacks (common hooks — avoid duplicating hub/session code in subclasses):**

`AutomaticSessionMode` owns the **`IExecutionMode` lifecycle** and invokes program code through a small **`AutomaticProgramContext`** (or registered callbacks), e.g.:

| Hook | Owner | Used for |
|------|-------|----------|
| Pulse complete → next gap | **Session mode** (sequencer) | All programs |
| `buildPlan(config, envelope)` | **Program subclass** | Start + future replan |
| `onPlanBuilt(plan)` optional | **Session mode** callback | Arm `schedule`, log serial |
| `complete(success, resultJson)` | **Session mode** → `command_handler` | Hub ack |
| `shouldEndSession()` | **Session mode** | Minutes / strokes |

Programs **do not** call SignalR or touch `relay_controller` directly — they return **data**; the session mode **acts**. Subclasses stay testable and small.

**Suggested firmware paths:**

```text
SomNet.Device/src/modes/
  automatic_session_mode.*
  automatic/
    automatic_program_base.*
    automatic_program_factory.*
    automatic_plan.*              ← schedule row, plan buffer
    programs/
      periodic_program.*
      random_program.*
      wave_program.*
      build_up_program.*
```

**Adding a future program:** extend `AutomaticRunMode` enum (Shared + UI) → new `FooProgram : AutomaticProgramBase` → factory case → UI dropdown + `getAutomaticFieldRules` row. **No edit** to sequencer FSM unless the new program needs a genuinely new execution primitive (unlikely).

**UI mirror:** one `AutomaticControls` + `getAutomaticFieldRules(mode)` — same modularity as firmware factory.

### Part 3 — burst-in-automatic (deferred, unrelated to sequencer design)

Bursts-on-at-% is an add-on to the planner/sequencer later. Part 2 sequencer stays **single-stroke steps** only.

---

## 9. Future — live settings during automatic playback (not Part 2)

**Source (2026-09-06):** Original product supports *“Settings can be adjustable during automatic playback, allowing on-the-fly pattern changes.”* **Nice-to-have later** — capture now so Part 2 design does not block it.

### Intended behavior (future)

| Step | Behavior |
|------|----------|
| 1 | Operator changes Automatic tab settings **while session is running** (power, timing, mode, end-session, etc.) |
| 2 | UI persists settings + sends **update to device** (not only at Start) |
| 3 | Device **ends or completes current stroke** (policy TBD), **replans** from new config |
| 4 | Sequencer **continues** from next gap with new `schedule[]` / wave params |
| 5 | **End Session After** respects **what already ran** — remaining strokes or remaining minutes, not full original quota |

### Why Part 2 differs today

| Part 2 (initial) | Future (live adjust) |
|------------------|----------------------|
| Config snapshot at **`automatic-start` only** | **`automatic-update`** (or equivalent) mid-session |
| UI controls **read-only while `running`** (P9P2-D18) | Controls **editable**; each save pushes device update |
| Planner runs **once** at start | Planner **re-runs** on update with **carry-forward state** |

### Device state required for replan

```text
sessionState = {
  strokesCompleted,
  sessionStartMs,
  elapsedMs,
  endSessionMode,
  endSessionValueOriginal,
  remainingStrokes OR remainingMinutes,   // derived
  sessionProgress,                          // 0..1 consumed (for wave phase / build-up)
  automaticMode                             // may change on update
}
```

**Replan input:** new config + `sessionState` → `buildPlan(config, remainingEnvelope, progressOffset)`.

**End session examples:**

| Mode | Already ran | New plan uses |
|------|-------------|---------------|
| **strokes** | 40 of 100 | **60** remaining strokes at new pattern |
| **minutes** | 12 of 30 min | **18** remaining minutes; wave `T_rise` may rescale to remaining envelope |
| **Wave / build-up** | 50% progress | Continue from **`t = 0.5`** with new min/max, or restart phase — P9P2-D29 |

### Protocol (future — open)

| Option | Description |
|--------|-------------|
| **`automatic-update`** | New `commandKey`; payload = full `AutomaticControlState` snapshot + optional `{ "applyAfter": "currentStroke" \| "immediate" }` |
| **Reuse `automatic-start`** | Rejected for Part 2 — would imply new session / confusing ack |
| **Hub + REST** | Same as other commands; UI sends when debounced settings change while `running` |

Device ack: immediate “update accepted” (P9-D2 style); no session stop unless operator presses Stop.

### Stroke interruption + overlapped replan (P9P2-D28)

**Preferred UX (2026-09-07):** When settings change mid-session, **start replanning while the current stroke is still finishing** so the operator barely notices a gap before the new pattern continues.

```text
automatic-update received during Pulse (relay ON):
  1. Mark pendingUpdate = true; stash newConfig
  2. Continue current stroke to normal relay OFF (do not block pulse path)
  3. In parallel (same loop passes, before next WaitingGap):
       newPlan = buildPlan(newConfig, remainingEnvelope, sessionState)
  4. On pulse complete: swap plan ← newPlan; reset sequencer index/deadline for row 0 of new plan
  5. Enter WaitingGap with first row of new plan (minimal extra latency)
```

| Policy | Trade-off |
|--------|-----------|
| **After current stroke + overlapped replan** ☑ proposed | Safest; replan hides in stroke tail + relay OFF callback window |
| **Immediate abort pulse** | Faster pattern switch; shortens `actualStrokeMs`; skip overlap |

**Note:** On ESP32, “parallel” = **same cooperative loop** — run `buildPlan()` in the gap between **`automatic-update` received** and **`onPulseComplete`**, or in **`onPulseComplete`** before arming the next gap. Planner must stay **non-blocking** (no long `delay()`); pre-compute budget may cap table size (see §8).

Heavy replan (large `schedule[]`) may still add one loop iteration — acceptable if stroke is ~200 ms+ and plan build is milliseconds.

### Part 2 design guardrails (do now)

- Keep **planner** (`buildPlan`) **separate** from **sequencer** so replan is a new planner call, not FSM rewrite.
- Track **`strokesCompleted`** and **`sessionStartMs`** in `AutomaticSessionMode` from day one — needed for summary anyway.
- Do **not** assume config is immutable for session lifetime in planner API — pass envelope explicitly.

### Decisions (future)

| # | Decision | Options | Choice | Date |
|---|----------|---------|--------|------|
| P9P2-D28 | **Apply update timing** | Immediate off / after stroke / **after stroke + overlapped replan** | ☐ **Proposed:** finish current stroke; **`buildPlan()` while stroke ends** (§9) | 2026-09-07 |
| P9P2-D29 | **Wave phase on update** | Keep phase `t` / reset to 0 / rescale to remaining envelope | ☐ TBD | |
| P9P2-D30 | **Command key** | `automatic-update` / other | ☐ **Proposed:** `automatic-update` | |
| P9P2-D31 | **UI debounce** | Every keystroke / blur-save / explicit Apply | ☐ TBD | |

**Explicitly out of scope:** Part 2 sign-off, Part 3 burst-in-auto.

---

## 5. Other UI enable rules (unchanged by mode dropdown)

These apply **in addition** to §2 (first match wins for `disabled`):

| Condition | Controls affected |
|-----------|-------------------|
| `running === true` | Min/max stroke ms, min/max power sliders, automatic mode dropdown (existing) |
| `endSessionMode === 'noAutoEnd'` | End session value field (existing); **`noAutoEnd` radio disabled** when `disableNoAutoEnd` (§2) |
| `burstsOn === false` | Burst Settings sub-fields (existing) |
| Start / Stop buttons | Disabled until automatic firmware ready (Phase 9 tooltip today) |

**Open:** Should **Timing Settings** (inter-stroke min/max, delay before start) also disable while `running`? → **P9P2-D18**.

---

## 6. UI implementation checklist

### 6.1 Shared types and API

- [x] Extend `SomNet.Shared/Enums/AutomaticRunMode.cs` with seven values (P9P2-D1)
- [x] Extend `SomNet.UI/src/types/modes.ts` — `AutomaticRunMode` + `AUTOMATIC_RUN_MODE_OPTIONS` labels
- [x] Confirm `JsonStringEnumConverter` serializes new values for saved pairing settings
- [x] Default remains `randomPowerAndTiming` for new Subs / missing key

### 6.2 Rules helper + component

- [x] Add `getAutomaticFieldRules(mode)` → `{ disableMinimumPower, disableStrokeMinSeconds, disableNoAutoEnd }`
- [x] Unit tests: all seven modes → expected disable flags + `disableNoAutoEnd` for 3 modes
- [x] `AutomaticControls`: End Session — disable **No AutoEnd** radio when `rules.disableNoAutoEnd`; coerce mode on dropdown change (P9P2-D22)
- [x] `AutomaticControls`: pass `disabled={rules.disableMinimumPower \|\| state.running}` to minimum power slider
- [x] `AutomaticControls`: pass `disabled={rules.disableStrokeMinSeconds}` to minimum (sec) field — **and** `state.running` if P9P2-D18
- [x] Populate dropdown with all seven options
- [x] Optional: `title` / helper text on disabled controls (P9P2-D17)
- [x] Mode summary + wave/build-up end-session hints (`automaticModeInfo.ts`)

### 6.3 Verification (UI only)

- [x] For each dropdown value, confirm min power and min sec enable/disable match §1 table (vitest matrix)
- [ ] Switch modes with saved settings — values persist (P9P2-D2 behavior documented)
- [ ] Regression: `noAutoEnd`, `burstsOn`, stroke limit clamping unchanged
- [ ] Saved settings round-trip via API after mode change

---

## 7. Firmware + integration checklist (after UI + decisions)

_Not required for UI-only pass._

### 7.1 Core engine

- [ ] **`AutomaticSessionMode`** — sequencer FSM, relay, end-session, abort, hub ack (§8 shell)
- [ ] **`AutomaticProgramBase`** + **`automatic_program_factory`** — `create(automaticMode)`
- [ ] **Program subclasses** in `modes/automatic/programs/` — Periodic, Random, Wave, BuildUp (§8)
- [ ] **`AutomaticProgramContext`** or callbacks — pulse complete, plan built, session complete (P9P2-D34)
- [ ] `automatic_plan.*` — schedule row buffer; parametric sampler helpers in `power_timing`
- [ ] End-session rules: minutes / strokes / manual stop (device-side count + timers)
- [ ] `automatic-start` immediate ack (P9-D2); `automatic-stop` + abort + summary `resultJson` (P9-D4)
- [ ] `command_handler` + `execution_context.startAutomatic()`

### 7.2 Per-mode smoke tests (bursts off)

- [ ] **Periodic** — fixed max power, fixed max gap, stable serial `[RELAY]` cadence
- [ ] **Random Power Only** — varying power, fixed gap
- [ ] **Random Timing Only** — fixed max power, varying gaps
- [ ] **Random Power and Timing** — both vary
- [ ] **Power Wave** — periodic power triangle; fixed gap; schedule pre-built
- [ ] **Power and Timing Wave** — periodic inverse power + gap; schedule pre-built
- [ ] **Build-Up** — half-wave ramp table; ends at max power + min gap

### 7.3 UI + API

- [ ] Enable Start/Stop; remove Phase 9 placeholder tooltip
- [ ] Session summary from stop `resultJson` (aggregated counts / duration)

---

## 8. Suggested order of work

1. **Confirm** P9P2-D8, D9, D11, D16, D17, D18 against original product (wave shape, period, build-up reset).
2. **Lock** D1–D7, D12–D15 (semantics in §3 are sufficient to start UI + firmware design).
3. **Implement §6** — dropdown + disable matrix (no hardware).
4. **Implement §7** — `AutomaticSessionMode` shell + `AutomaticProgramBase` subclasses (§8 modular layout).
5. **Update** [device plan §6](./09-ESP32-Device-Plan.md) program catalog when decisions marked ☑.

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-06 | Initial checklist from original product automatic mode dropdown rules |
| 2026-09-06 | §3 execution semantics, session envelope, §8 planner/sequencer, §9 live update |
| 2026-09-07 | §9 overlapped replan (P9P2-D28); waveform pre-compute model |
| 2026-09-07 | §8 modular layout locked — `AutomaticProgramBase` subclasses + factory (P9P2-D32–D34) |
