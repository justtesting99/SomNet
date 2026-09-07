# Phase 9 Part 2 — Automatic mode checklist

**Status:** **Signed off** (2026-09-07). Includes device-initiated session complete via SignalR (`automatic-session-complete`).

| Related | Link |
|---------|------|
| Parent sign-off | [09-ESP32-Phase-9-Checklist.md](./09-ESP32-Phase-9-Checklist.md) Part 2 |
| Device execution | [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §6 |
| UI component | `SomNet.UI/src/components/modes/AutomaticControls.tsx` |
| Shared state | `AutomaticControlState` / `AutomaticControlStateDto` |
| API round-trip script | `Scripts/verify-settings-roundtrip.ps1` |

**Reference pattern:** Manual **burst** = N strokes × fixed `strokeMs` + fixed gap between strokes. Automatic modes (bursts off) = **indefinite single strokes** until stop/end-session/abort, with power and/or gap chosen per mode below.

---

## Part 2 at a glance

| Item | Value |
|------|--------|
| **Goal** | Seven automatic programs on ESP32; UI Start/Stop E2E; session summary from device `resultJson` |
| **Duration** | ~2–3 weeks (phased — Periodic first, then random, then wave/build-up) |
| **Hardware scope** | Same DevKit (`esp32-84CCA85C36B4` / `Slv66`); relay **D4**; serial `[RELAY]` / `[AUTO]` logs |
| **Software scope** | `AutomaticSessionMode` + program factory; `automatic-start`/`stop`; UI wiring; API payload validation |
| **Explicitly out of scope** | Burst-in-automatic (Part 3); live `automatic-update` (§9); `esp_timer` gap precision |
| **Blocks** | Operators using **Automatic Start/Stop** from web app (buttons disabled today) |

Update **Status** above and check boxes in **§7** as work completes. When Part 2 is done, update [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §6 and bump firmware version (P9P2-D38).

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
optional delayBeforeStart → pick power% → map to strokeMs → pulse → wait gap → repeat until stop / end rule / abort
```

**Stroke-first (P9P2-D41):** first pulse fires immediately after start ack (or after **Delay Before Start** when set). Inter-stroke **`gapSec`** applies **between** strokes only — same pattern as manual **burst** (pulse → gap → pulse), not gap-before-first-stroke.

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
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────┐
│ delayBefore │────►│ pick power  │────►│    pulse     │────►│ wait gap │──┐
│   Start     │     │ → strokeMs  │     │   (relay)    │     │(mode log)│  │
└─────────────┘     └─────────────┘     └──────────────┘     └──────────┘  │
       │ skip if 0        ▲                                                    │
       └──────────────────┴──── end rule / stop / abort ─────────────────────┘
```

(`delayBeforeStart` optional; when zero, first pulse is immediate after ack.)

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

**End Session mapping for wave modes (P9P2-D23 — locked Option A):**

| Choice | Meaning |
|--------|---------|
| ☑ **A** | End Session **minutes** value = **`T_rise`**; **`T_wave = 2 × T_rise`**; wave **repeats** until session end rule fires |
| ~~B~~ | ~~Total session = End Session value; `T_rise = value / 2`~~ — not chosen |
| ~~C~~ | ~~Stroke count drives table length only~~ — not chosen for minutes; **strokes** end-session still uses stroke count as N for pre-compute where applicable |

When **End Session = strokes**, pre-compute **N** `(power, gap)` rows (build-up) or sample repeating wave phase for N strokes (wave modes). When **End Session = minutes**, derive session wall-clock limit from operator value; **`T_rise`** from minutes field per Option A.

Stroke-based End Session fits **pre-compute N rows** naturally. Minutes-based uses **`T_rise = endSessionValue`** and iterates strokes at fixed or scheduled gap until wall-clock end.

**Execution loop (wave / build-up):**

```text
on automatic-start:
  schedule[] = buildWaveformSchedule(config)   // § waveform pre-computation

on each stroke i:
  (power, gapSec) = schedule[i]   // or schedule[i mod len] for repeating wave within longer session
  strokeMs = strokeMsFromPower(power, minStrokeMs, maxStrokeMs)
  pulse; wait gapSec   // stroke-first: first pulse before any gap (P9P2-D41)
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

## 4. Decisions (locked 2026-09-07 — before firmware coding)

| # | Decision | Options | Choice | Date |
|---|----------|---------|--------|------|
| P9P2-D1 | **Enum values** | camelCase JSON / PascalCase / integer | ☑ **camelCase** (`periodic`, `randomPowerOnly`, …) aligned with `AutomaticRunMode` | 2026-09-07 |
| P9P2-D2 | **Disabled field values** | Keep stored / force min=max / reset default | ☑ **Keep stored**; firmware **ignores** disabled mins per §3 | 2026-09-07 |
| P9P2-D3 | **Change mode while `running`** | Block / defer / live update | ☑ **Block** — dropdown disabled while `running` (UI done) | 2026-09-07 |
| P9P2-D4 | **`automatic-start` payload** | Full snapshot / omit disabled / mode only | ☑ **Full snapshot** + `automaticMode`; device applies §3 rules; **omit `running`** | 2026-09-07 |
| P9P2-D5 | **Periodic — fixed power** | Max / min / last slider | ☑ **Maximum power** when min power disabled | 2026-09-07 |
| P9P2-D6 | **Fixed gap (Periodic, Random Power, Power Wave)** | `strokeMaxSeconds` / average min+max | ☑ **`strokeMaxSeconds`** when min sec disabled | 2026-09-07 |
| P9P2-D7 | **Random Timing Only — fixed power** | Max / min | ☑ **Maximum power** | 2026-09-07 |
| P9P2-D8 | **Wave shape** | Sine / triangle / linear | ☑ **Triangle** (piecewise linear min↔max) on MCU | 2026-09-07 |
| P9P2-D9 | **Wave period** | Single cycle / repeating / end only | ☑ **`T_wave = 2 × T_rise`**; repeat until session end | 2026-09-06 |
| P9P2-D10 | **Build-Up curve** | Linear / ease-in / half triangle | ☑ **Half-wave** ascending ramp (linear segments) | 2026-09-06 |
| P9P2-D11 | **Build-Up reset** | Once / repeat | ☑ **Once per session** | 2026-09-06 |
| P9P2-D12 | **Power vs timing coupling** | Independent / inverse | ☑ **Inverse** for Build-Up and P+T Wave | 2026-09-07 |
| P9P2-D13 | **Burst Settings panel** | Part 2 / Part 3 / defer | ☑ **Part 3** — out of scope Part 2 | 2026-09-06 |
| P9P2-D14 | **End Session panel** | Unaffected / partial | ☑ **`noAutoEnd` disabled** for wave + build-up | 2026-09-06 |
| P9P2-D15 | **Inverse wave phasing** | 180° / independent | ☑ **180° inverse** for P+T Wave | 2026-09-06 |
| P9P2-D16 | **Build-Up duration** | Full session / other | ☑ **End Session envelope = full half-wave** | 2026-09-06 |
| P9P2-D17 | **Disabled min field hints** | None / tooltip / visible text | ☑ **Visible helper text** + mode summary | 2026-09-07 |
| P9P2-D18 | **Config while running** | Read-only / live update | ☑ **Read-only** Part 2; §9 later | 2026-09-07 |
| P9P2-D19 | **Build-up phase `t`** | `i/N` / **`i/(N−1)`** / time-based | ☑ **`t = strokeIndex / (N−1)`** for N>1 (last stroke at max) | 2026-09-07 |
| P9P2-D20 | **`noAutoEnd` + wave/build-up** | Allow / disable | ☑ **Disable** in UI | 2026-09-06 |
| P9P2-D21 | **Wave repetition** | Single / repeat | ☑ **Repeat** until End Session rule | 2026-09-06 |
| P9P2-D22 | **Switch to wave with `noAutoEnd`** | Coerce / block | ☑ **Coerce to `minutes`** + keep value | 2026-09-07 |
| P9P2-D23 | **End Session → `T_rise` (wave)** | A / B / C | ☑ **Option A** — minutes value = **`T_rise`**; see §3 | 2026-09-07 |
| P9P2-D24 | **Pre-compute location** | Device / UI table / hybrid | ☑ **Device** at `automatic-start` | 2026-09-07 |
| P9P2-D25 | **Wave sample (alias D8)** | Triangle / sine | ☑ **Triangle** (same as P9P2-D8) | 2026-09-07 |
| P9P2-D26 | **Planner vs sequencer** | Monolithic / split | ☑ **Planner at start + sequencer FSM** | 2026-09-06 |
| P9P2-D27 | **Gap timing mechanism** | RTOS timer / FSM+millis | ☑ **Sequencer FSM + `millis()`** | 2026-09-06 |
| P9P2-D32 | **Class split** | Monolithic / shell + programs | ☑ **`AutomaticSessionMode` + `AutomaticProgramBase` + factory** | 2026-09-07 |
| P9P2-D33 | **Seven IExecutionMode classes** | One per program / one automatic | ☑ **One** `AutomaticSessionMode` only | 2026-09-07 |
| P9P2-D34 | **Program hooks** | Virtual only / subclass + callbacks | ☑ **Subclasses** plan data; session owns FSM + relay + ack | 2026-09-07 |
| P9P2-D35 | **Firmware build order** | All at once / periodic first / random first | ☑ **Phase A:** shell + **Periodic** smoke test, then random, then wave/build-up | 2026-09-07 |
| P9P2-D36 | **Random mode planner** | On-the-fly / pre-fill table | ☑ **On-the-fly** — sample power/gap each stroke; no `schedule[]` | 2026-09-07 |
| P9P2-D37 | **Command keys (UI → hub)** | `automatic:start` / **`automatic-start`** | ☑ **`automatic-start`** / **`automatic-stop`** (hyphen, match P9-D5 + API) — **fix UI** in Phase D | 2026-09-07 |
| P9P2-D38 | **Firmware version at Part 2 sign-off** | `0.9.1-phase9p2` / `0.10.0-phase9p2` / other | ☑ **`0.9.1-phase9p2`** when all §7.2 pass | 2026-09-07 |
| P9P2-D41 | **Session cadence** | Gap before first stroke / **stroke-first** | ☑ **Stroke-first** — pulse immediately after start (or after `delayBeforeStartSeconds`); gap **between** strokes only; matches burst UX | 2026-09-07 |
| P9P2-D40 | **Schedule buffer RAM cap** | Unbounded / fixed cap | ☑ **`kMaxAutomaticScheduleRows = 2048`** in `automatic_plan.h` | 2026-09-07 |

### Confirmed (inherits parent Phase 9 — no new Part 2 decision)

- **P9-D2** — immediate ack on `automatic-start` when config valid + engine armed
- **P9-D4** — summary `resultJson` on stop/abort/end-rule only (no per-stroke hub events)
- **P9-D5** — camelCase payload aligned with `AutomaticControlStateDto`
- **P9-D6** — reject or ignore `burstsOn: true` until Part 3
- **P9-D1** — ack timeouts: `automatic-start` **5 s**; `automatic-stop` **30 s**
- **P9-D9** — caps: auto session hard cap **24 h**; stroke ms per existing limits

### Reference — options considered (Part 2 firmware walkthrough 2026-09-07)

| # | Option A (chosen where ☑) | Option B | Option C |
|---|---------------------------|----------|----------|
| P9P2-D8 | Triangle | Linear only | Sine |
| P9P2-D19 | `i/(N−1)` last at max | `i/N` | Time-based `t` |
| P9P2-D23 | Minutes = `T_rise`; repeat wave | Total session = value | Strokes = table length |
| P9P2-D35 | Shell + Periodic first | Shell + all random | All 7 before UI |
| P9P2-D36 | On-the-fly random | Pre-fill max table | Hybrid by end mode |
| P9P2-D37 | `automatic-start` (fix UI) | Keep `automatic:start` | Accept both in firmware |

---

## 8. Architecture — planner + stroke sequencer (automatic timing)

**Question (general):** After calculating wave/build-up/random **data points**, how should firmware **send / fire strokes** on time? Do we need a **scheduler**?

**Answer:** You need a **stroke sequencer** (deadline-driven executor), not a separate OS scheduler or server-driven ticks. SomNet already uses this pattern for any “wait, then act” device timing — automatic mode applies it to **every** program (periodic, random, wave, build-up).

### Two layers (all automatic modes)

| Layer | When | Job |
|-------|------|-----|
| **1. Planner** | Once at `automatic-start` | Turn config into **what** each stroke is: `schedule[i] = (power, gapSec, strokeMs)` — from pre-computed table, RNG seed plan, or parametric wave |
| **2. Sequencer** | Every `loop()` → `AutomaticSessionMode::poll()` | Turn plan into **when** strokes fire: pulse → wait gap → pulse → … (stroke-first, P9P2-D41) |

The **sequencer is the “scheduler”** in embedded terms: it does not recalculate the wave; it **plays back** the plan on **`millis()` deadlines**.

### Sequencer FSM (applies to periodic, random, wave, build-up)

```
StartDelay (optional) → Pulse → WaitingGap → Pulse → WaitingGap → … → SessionComplete
```

| State | Responsibility |
|-------|----------------|
| **StartDelay** | Wait `delayBeforeStartSeconds`, then **first pulse immediately** (P9P2-D41) |
| **WaitingGap** | After each pulse, until `millis() >= nextDeadline`, use row **`gapSec`** (from plan or on-the-fly) |
| **Pulse** | `relay->requestPulse(strokeMs)` — **`relay_controller`** owns GPIO pulse width |
| **Between strokes** | `relay_controller.poll()` runs in main loop (same as manual/burst today) |

**Trigger rule:** on start (or after StartDelay): **first pulse immediately**. After each pulse completes: set **`nextDeadline = now + gapSec`**, enter **WaitingGap**, then load next row when deadline reached. Same as burst cadence for the inter-stroke gap only.

```text
automatic-start:
  plan = buildPlan(payload)     // planner: all modes
  if delayBeforeStart > 0: StartDelay
  else: start first pulse immediately

each poll() [AutomaticSessionMode]:
  if state == WaitingGap && now >= nextDeadline && !relay.active:
      row = plan[i]             // or sample on the fly
      relay.requestPulse(row.strokeMs, …)
      state = Pulse
  on pulse complete:
      nextDeadline = millis() + row.gapSec * 1000
      state = WaitingGap
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
- [x] Switch modes with saved settings — values persist (P9P2-D2) — vitest + manual confirm below
- [x] Regression: `noAutoEnd`, `burstsOn`, stroke limit clamping unchanged — vitest + code review 2026-09-07
- [x] Saved settings round-trip via API after mode change — `Scripts/verify-settings-roundtrip.ps1` 2026-09-07

#### 6.3.1 Mode switch — values persist (P9P2-D2)

**Expected:** Changing automatic mode only updates `automaticMode` (and coerces `endSessionMode` for wave/build-up). Disabled min fields keep their stored values; firmware will ignore them at runtime.

Use **distinctive numbers** so you can spot accidental resets. Example using on-screen labels:

| Step | Action | Pass if |
|------|--------|---------|
| 1 | **Power Settings:** set **Minimum Power** to **15%**, **Maximum Power** to **80%** | Sliders/readouts show 15% and 80% |
| 1b | **Timing Settings → Time Between Strokes:** set **Minimum (sec)** to **3**, **Maximum (sec)** to **25** | Fields show 3 and 25 |
| 1c | **Timing Settings → End Session After:** set the number box to **42**, choose **Minutes** | Shows 42 + Minutes selected |
| 2 | **Controls:** switch **Random Power and Timing → Periodic** | **Minimum Power** and **Minimum (sec)** grey out; 15%, 80%, 3, 25, and 42 unchanged |
| 3 | Switch **Periodic → Build-Up** | **End Session After** coerces to **Minutes** (No AutoEnd unavailable); power and timing numbers still 15%, 80%, 3, 25, 42 |
| 4 | Hard refresh | Same automatic mode + same numbers reload |

**Manual sign-off:** ☑ passed 2026-09-07

#### 6.3.2 Regression — noAutoEnd, burstsOn, stroke limits

| Area | Step | Pass if |
|------|------|---------|
| **noAutoEnd** | On Random P+T, under **End Session After** select **No AutoEnd** | The number box (left of the radios) greys out |
| | Switch to **Power Wave** | **No AutoEnd** radio disabled; selection becomes **Minutes**; number box editable |
| | Switch back to Random P+T, pick **No AutoEnd** again | Number box greys out again |
| **burstsOn** | **Burst Settings** panel | All burst controls disabled (Part 3); **Bursts On** unchecked; values still save/load with settings |
| **Stroke limits** | **Power Settings:** edit **Minimum Stroke (ms)** / **Maximum Stroke (ms)** outside device limits | Clamps to API stroke limits on commit/load |
| | Set maximum stroke below minimum | Minimum adjusts so min ≤ max |

**Note:** Pre–Part 3, burst sub-fields are hard-disabled in UI (not only `burstsOn === false`). Saved `burstsOn` and burst ranges should still round-trip in JSON.

**Automated sign-off (2026-09-07):** `automaticFieldRules.test.ts` (noAutoEnd coercion); `strokeMsLimits.test.ts` (clamp); burst panel intentionally all-disabled until Part 3.

#### 6.3.3 API round-trip after mode change

| Step | Action | Pass if |
|------|--------|---------|
| 1 | Open DevTools → **Network** | — |
| 2 | Change automatic mode (wait ~500 ms for debounced save) | **PUT** `/api/settings?subTarget=…` with `"automaticMode":"…"` camelCase |
| 3 | Hard refresh | **GET** `/api/settings` returns same `automaticMode` and numeric fields |
| 4 | Optional: inspect DB / `SettingsJson` | Contains `"automaticMode":"powerWave"` (or chosen mode), not PascalCase enum integer |

**All seven enum strings:** `periodic`, `randomPowerOnly`, `randomTimingOnly`, `randomPowerAndTiming`, `powerWave`, `powerAndTimingWave`, `buildUp`

**Automated sign-off (2026-09-07):** `Scripts/verify-settings-roundtrip.ps1` — login demo/demo, PUT `powerWave` + test values, GET confirms, restores prior mode.

---

---

## 7. Firmware + integration checklist

**Prerequisites (before Phase A coding)**

### Completed upstream

- [x] Phase 9 Part 1 **Signed off** — burst E2E ([09-ESP32-Phase-9-Checklist.md](./09-ESP32-Phase-9-Checklist.md))
- [x] Part 2 **§6 UI complete** — dropdown, disable rules, persistence, API round-trip
- [x] Part 2 **§4 decisions locked** (2026-09-07)
- [ ] Review §3 execution semantics + §8 architecture (planner/sequencer)
- [ ] Review `BurstSequenceMode` — gap FSM pattern to mirror
- [ ] Review P9-D2/D4/D5 ack + payload rules (parent Phase 9)

### Developer environment

- [ ] SomNet API + UI running (local LAN)
- [ ] ESP32 paired + connected (`Slv66` or test Sub)
- [ ] Serial 115200 — `[CMD]` / `[RELAY]` / `[AUTO]` prefix (pick in Phase A)
- [ ] Swagger or UI for `automatic-start` regression before enabling UI buttons

### Current state (entering firmware)

| Layer | Today | Part 2 target |
|-------|-------|---------------|
| **`AutomaticSessionMode`** | Shell + Periodic FSM wired | Full sequencer + all 7 programs |
| **`execution_context`** | + `startAutomatic()` / `stopAutomatic()` | unchanged |
| **`command_handler`** | `automatic-start` / `automatic-stop` (+ legacy `:` keys) | unchanged |
| **`power_timing`** | `strokeMsFromPower()` only | + triangle sampler, inverse gap, build-up ramp |
| **UI Start/Stop** | ☑ Wired; keys **`automatic-start`** / **`automatic-stop`** | unchanged |
| **API validator** | ☑ stroke + burst + **`automatic-start`** | unchanged |
| **Firmware version** | **`0.9.1-phase9p2`** (P9P2-D38 locked in `platformio.ini`) | unchanged at Part 2 sign-off |

---

### Phase A — Shell + Periodic (P9P2-D35)

**Goal:** One program working on bench — stable cadence at max power + max gap.

#### A.1 Scaffolding

- [x] `automatic/automatic_config.*` — parse JSON payload (camelCase fields, `automaticMode` enum string)
- [x] `automatic/automatic_plan.*` — pre-compute `StrokeScheduleRow[]` at start (wave + build-up); cap **2048** rows (P9P2-D40)
- [x] `automatic/automatic_program_base.h` — virtual `getStrokeParameters(session, index, config, …)`
- [x] `automatic/automatic_program_factory.*` — `create(automaticMode)`; Periodic case first; others reject "not implemented yet"
- [x] `automatic/programs/periodic_program.*` — max power + max gap; apply D2/D5/D6 ignore rules

#### A.2 Session mode + wiring

- [x] Expand `automatic_session_mode.*` — states: `Idle`, `StartDelay`, `WaitingGap`, `Pulse` (Complete via `finishSession`)
- [x] Sequencer: stroke-first (P9P2-D41) — pulse immediately after start or `delayBeforeStartSeconds`; gap between strokes only
- [x] End session: `minutes`, `strokes`, `noAutoEnd`, manual stop, abort (reuse burst abort pattern)
- [x] `execution_context` — member + `startAutomatic()` / `stopAutomatic()` / extend `abortActive()`
- [x] `command_handler` — route `automatic-start` (immediate ack P9-D2), `automatic-stop` (summary P9-D4)
- [x] Reject `burstsOn: true` in payload (P9-D6)
- [x] Serial log prefix `[AUTO]` for state transitions (optional P9P2-D39)
- [x] `ExecuteCommandPayload.payloadJson[768]` for full automatic snapshot
- [x] Defer `ExecuteCommand` to main loop (stack overflow fix — hub frame + automatic JSON parse)
- [x] `CONFIG_ARDUINO_LOOP_STACK_SIZE=12288` in `platformio.ini`
- [x] **`pio run -e dev`** compiles (2026-09-07)

#### A.3 Periodic smoke (§7.2 #1)

- [x] Swagger: start Periodic, `strokeMaxSeconds=20`, max power — stable `[RELAY]` every ~20 s + ~400 ms strokeMs (2026-09-07, 10 strokes, `endSession`)
- [x] Stop → ack includes `strokesCompleted`, duration, `automaticMode` (`automatic-stop` manual) — Phase D E2E 2026-09-07
- [x] Abort mid-session → interrupt summary via `automatic-session-complete` — firmware Phase A; UI Phase F

**Phase A exit:** Periodic runs ≥5 min or 10 strokes without drift crash; stop summary plausible. **Met** for start + cadence + stroke end (2026-09-07). Manual stop via UI (Phase D); abort via UI (Phase F).

---

### Phase B — Random family (P9P2-D36 on-the-fly)

**Goal:** Three random programs; no schedule table.

- [x] `random_program.*` — single class; mode selects power only / timing only / both
- [x] **Random Power Only** — uniform `[minPower, maxPower]`; gap = `strokeMaxSeconds`
- [x] **Random Timing Only** — power = `maximumPower`; gap uniform `[strokeMinSec, strokeMaxSec]`
- [x] **Random P+T** — both uniform (`esp_random()` on-the-fly)
- [x] Factory cases for `randomPowerOnly`, `randomTimingOnly`, `randomPowerAndTiming`
- [x] Gap range normalized on parse (mirror power range); fixed/random fields per §3 mode rules

#### B.1 Smoke tests (§7.2 #2–4)

- [x] Random Power Only — varying `strokeMs` in serial log; fixed gap (2026-09-07: 44–99%, gap 20 s)
- [x] Random Timing Only — fixed power; varying gap intervals (2026-09-07: 100%, gap 8–19 s)
- [x] Random P+T — both vary (2026-09-07: power 27–79%, gap 14–25 s)

**Phase B exit:** All three random modes start/stop cleanly. **Met** 2026-09-07 (stroke `endSession`; manual stop/abort → Phase D).

---

### Phase C — Wave + Build-Up (pre-compute on device, P9P2-D24)

**Goal:** Triangle waves + half-wave build-up; inverse gap for P+T and build-up.

- [x] `power_timing` — `sampleTriangle01`, inverse gap helpers, `sampleBuildUpRow`; `strokeMsFromPower()` (existing)
- [x] `table_program.*` — indexed schedule playback (`TableProgram`)
- [x] `automatic_plan.*` — Power Wave, P+T Wave, Build-Up schedule builders
- [x] Schedule buffer cap **`kMaxAutomaticScheduleRows = 2048`** (~16 KB, P9P2-D40)
- [x] **Power Wave** — repeating triangle power; fixed `strokeMaxSeconds` gap; T_rise from D23-A
- [x] **Power and Timing Wave** — inverse periodic gap wave (180°, P9P2-D15)
- [x] **Build-Up** — half-wave ramp `t = i/(N−1)` (P9P2-D19); inverse gap
- [x] Reject `noAutoEnd` / missing end session for wave + build-up modes
- [x] **`pio run -e dev`** compiles (2026-09-07)

#### C.1 Smoke tests (§7.2 #5–7)

- [x] Power Wave — oscillating `strokeMs` (20→100→80→40%); fixed 20 s gap (2026-09-07, 8 strokes)
- [x] P+T Wave — power rises as gap shortens; inverse coupling visible (2026-09-07)
- [x] Build-Up — monotonic power 20→100%; gap 25→8 s (2026-09-07)

**Phase C exit:** All seven programs pass bench smoke. **Met** 2026-09-07.

---

### Phase D — UI + API integration (§7.3)

- [x] Fix UI command keys: `automatic-start` / `automatic-stop` (P9P2-D37) in `hardwareCommand.ts`
- [x] `AutomaticControls` — enable Start/Stop; build payload from `settings.automatic` (omit `running`)
- [x] Apply `getAutomaticFieldRules` on device OR send full snapshot (device applies §3 — P9P2-D4)
- [x] `HardwareCommandPayloadValidator` — validate automatic-start fields + reject `burstsOn`
- [x] Parse stop `resultJson` → session summary (`SessionProvider` / `sessionSummary.ts`)
- [x] Remove Phase 9 placeholder tooltip on Start/Stop
- [x] E2E: UI Periodic start → device runs → UI stop → history entry — **2026-09-07** (3 strokes / 12599 ms / `manualStop`)

### Phase E — Auto-end UI sync (P9-D4 completion)

- [x] Firmware: `finishSession` pushes `resultJson` with `correlationId=automatic-session-complete` when not `automatic-stop`
- [x] UI: SignalR `CommandAcknowledged` listener (`AutomaticSessionHubListener`)
- [x] UI: `@microsoft/signalr` operator hub connection
- [x] E2E: Periodic **8 strokes** end rule — UI unlocks without manual Stop — **2026-09-07** (37672 ms / `endSession`)

### Phase F — Abort during automatic (UI)

- [x] `AutomaticControls` — **Abort** button enabled while session running
- [x] Sends `abort` command; session finalized via hub `automatic-session-complete` (with REST fallback)
- [ ] E2E: Start Periodic → **Abort** mid-session → UI unlocks + history `(aborted)`

**Part 2 sign-off exit:** Dom runs any of seven modes from UI on paired hardware; session history from device summary. **Met** for Periodic via UI (2026-09-07); remaining six modes verified via Swagger in Phases A–C.

---

### 7.2 Per-mode smoke tests (summary — detail in Phases A–C)

| # | Mode | Phase | Status |
|---|------|-------|--------|
| 1 | Periodic | A | ☑ |
| 2 | Random Power Only | B | ☑ |
| 3 | Random Timing Only | B | ☑ |
| 4 | Random Power and Timing | B | ☑ |
| 5 | Power Wave | C | ☑ |
| 6 | Power and Timing Wave | C | ☑ |
| 7 | Build-Up | C | ☑ |

---

### 7.4 Documentation + version (at sign-off)

- [x] Update [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §6 program catalog
- [x] Extend `SomNet.Device/docs/PROTOCOL.md` — automatic-start/stop payload + `resultJson`
- [x] Bump firmware to **`0.9.1-phase9p2`** (P9P2-D38) — locked in `SomNet.Device/platformio.ini` 2026-09-07
- [x] Mark Part 2 **Status: Signed off** in this file + parent Phase 9 Part 2 blurb

---

## 10. Suggested order of work

1. ~~**Lock §4 decisions**~~ — done 2026-09-07
2. ~~**Implement §6 UI**~~ — done 2026-09-07
3. ~~**Phase A** — shell + Periodic (§7 Phase A)~~ — **bench signed off** 2026-09-07; optional stop/abort smoke
4. ~~**Phase B** — random family~~ — **bench signed off** 2026-09-07
5. ~~**Phase C** — wave + build-up~~ — **bench signed off** 2026-09-07
6. ~~**Phase D** — UI/API integration + E2E sign-off~~ — **signed off** 2026-09-07
7. ~~**Phase E** — auto-end UI sync (hub listener)~~ — **signed off** 2026-09-07
8. **Phase F** — abort during automatic UI — code complete; E2E sign-off pending
9. ~~**Update** device plan + PROTOCOL + firmware version~~ — **done** 2026-09-07

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-06 | Initial checklist from original product automatic mode dropdown rules |
| 2026-09-06 | §3 execution semantics, session envelope, §8 planner/sequencer, §9 live update |
| 2026-09-07 | §9 overlapped replan (P9P2-D28); waveform pre-compute model |
| 2026-09-07 | §8 modular layout locked — `AutomaticProgramBase` subclasses + factory (P9P2-D32–D34) |
| 2026-09-07 | §6 UI signed off; §4 decisions locked; §7 expanded to Phases A–D firmware checklist |
| 2026-09-07 | Walkthrough decisions: D23-A, D8 triangle, D19, D35–D37 |
| 2026-09-07 | Phase C bench smoke passed — all 7 programs verified on device |
| 2026-09-07 | Phase D E2E signed off — UI Periodic start/stop; session history from device `resultJson` |
| 2026-09-07 | Phase E signed off — auto-end via `automatic-session-complete` + SignalR UI sync |
| 2026-09-07 | Phase F — abort during automatic UI (`AutomaticControls` Abort + hub finalize helper) |
