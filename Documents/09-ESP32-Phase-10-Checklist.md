# Phase 10 — Burst-in-automatic (`burstsOn`)

**Status:** **Planning** — §4 decisions locking; **minutes burst spacing agreed** (subject to original-author verification). No firmware/UI coding until remaining §4 items locked.

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
- When bursts are **on**, the device inserts **burst events** at **even intervals** across the planned session. On a burst slot, **Burst Settings** (style, power, delay, stroke count) run a full mini-sequence; then control returns to the **main automatic program** until the next burst slot.

**Example:** End Session **100 strokes**, **Percent 10** → **10 burst events** spread evenly across the program (not a random 10% chance each step). Between burst slots, the main program runs normal single-stroke cadence steps.
- **Stop**, **Abort**, and **End Session After** behave as today — abort still cuts the relay immediately; stop waits for a safe point (see §3).

This is **not** manual burst mode. Manual burst is a one-shot command with fixed count, power, and delay. Automatic burst is **embedded** in a long-running automatic session and uses **ranges** (min/max strokes, power, delay) plus a **probability** (`burstPercent`).

---

## 2. UI fields (already implemented — enable in Phase 10)

| Field | Type | Purpose (intended) |
|-------|------|-------------------|
| **Bursts On** | checkbox | Master enable; when false, device behaves as Part 2 (single strokes only) |
| **Percent (0–100)** | `burstPercent` | How many **burst events** occur, **evenly spread** across the program envelope — see **§3.6** (not random per step) |
| **Burst Style** | `burstStyle` | Selects which burst dimensions are **fixed at maximum** vs **random in range** — see **§2.1** |
| **Burst Stroke Power min/max** | 0–100 % | **Relative to main Power Settings** (`minimumPower`–`maximumPower`); see **§2.2** — not independent full-scale 0–100 |
| **Delay Between Burst Strokes** | min/max sec | Inter-stroke gap **inside** a burst (mirror manual burst `burstDelayMs`) |
| **Number of Strokes in Each Burst** | min/max | How many pulses per burst event |

**Part 2 behavior (today):** entire Burst Settings panel is **hard-disabled** in `AutomaticControls`; API/device **reject** `burstsOn: true` on `automatic-start`.

**Phase 10 UI exit:** enable panel when not `running`; **`getBurstFieldRules(burstStyle)`** for min-field disable rules (§2.1); validate ranges on save; send full snapshot including burst fields on Start.

---

## 2.1 Burst Style dropdown — UI rules and device semantics

**Source (2026-09-07):** Original product **Burst Style** controls which **minimum** fields grey out in Burst Settings. Same pattern as automatic program rules (Part 2 §2): when a **minimum** is disabled, the device uses the **maximum** value for that dimension; stored min values still persist in settings JSON (P9P2-D2).

### Four styles (enum — camelCase JSON)

| UI label | `burstStyle` value | Burst stroke power **min** | Delay between burst strokes **min** |
|----------|-------------------|----------------------------|-------------------------------------|
| **Fixed Power/Delay** | `fixedPowerDelay` | **Disabled** | **Disabled** |
| **Random Power Only** | `randomPowerOnly` | Enabled | **Disabled** |
| **Random Delay Only** | `randomDelayOnly` | **Disabled** | Enabled |
| **Random Power/Delay** | `randomPowerAndDelay` | Enabled | Enabled |

**Always enabled (all styles):** **Percent**, **Burst Stroke Power max**, **Delay max**, **Number of Strokes in Each Burst** min/max, **Bursts On**.

**Not affected by style:** **Number of Strokes in Each Burst** — min/max stay editable for every style (stroke count range is independent of power/delay style).

### UI helper (mirror Part 2)

```typescript
getBurstFieldRules(burstStyle) → {
  disableBurstStrokePowerMin: boolean,
  disableBurstDelayMin: boolean,
}
```

| `burstStyle` | `disableBurstStrokePowerMin` | `disableBurstDelayMin` |
|--------------|------------------------------|------------------------|
| `fixedPowerDelay` | true | true |
| `randomPowerOnly` | false | true |
| `randomDelayOnly` | true | false |
| `randomPowerAndDelay` | false | false |

Wire in `AutomaticControls` Burst Settings panel: pass `disabled={rules.disableBurstStrokePowerMin || configLocked}` to power **min**; same for delay **min**. Optional helper text when disabled: *“Not used — device uses maximum.”*

### Device behavior per style (inside each burst event)

When a burst triggers, draw **stroke count** uniformly from `[burstStrokesMin, burstStrokesMax]` (all styles). For each stroke **inside** the burst:

| `burstStyle` | Power per intra-burst stroke | Delay before next intra-burst stroke |
|--------------|------------------------------|--------------------------------------|
| **`fixedPowerDelay`** | **`burstStrokePowerMax`** | **`burstDelayMax`** (seconds) |
| **`randomPowerOnly`** | Uniform **`[burstStrokePowerMin, burstStrokePowerMax]`** | **`burstDelayMax`** |
| **`randomDelayOnly`** | **`burstStrokePowerMax`** | Uniform **`[burstDelayMin, burstDelayMax]`** |
| **`randomPowerAndDelay`** | Uniform **`[burstStrokePowerMin, burstStrokePowerMax]`** | Uniform **`[burstDelayMin, burstDelayMax]`** |

Power maps to `strokeMs` via session **`minimumStrokeMs` / `maximumStrokeMs`** after resolving burst power through the main power envelope (**§2.2**). Delays inside burst use **`millis()`** gap FSM (same as manual `BurstSequenceMode`).

**Payload:** Send **full snapshot** on `automatic-start` including disabled mins; firmware applies table above (ignore disabled mins).

### 2.2 Burst stroke power — relative to main Power Settings (P10-D5 ☑)

**Burst Stroke Power** min/max (0–100) are **not** absolute device power. They express **where inside the main automatic Power Settings range** each intra-burst stroke should land:

| Burst setting | Resolves to |
|---------------|-------------|
| **0** | `minimumPower` (main Power Settings min) |
| **100** | `maximumPower` (main Power Settings max) |
| **50** | Midpoint between `minimumPower` and `maximumPower` |

**Firmware (each intra-burst stroke):**

```text
burstRelative = draw per §2.1 style from [burstStrokePowerMin, burstStrokePowerMax]   // 0–100
effectivePowerPercent = lerp(minimumPower, maximumPower, burstRelative / 100)
strokeMs = strokeMsFromPower(effectivePowerPercent, minimumStrokeMs, maximumStrokeMs)
```

**Example:** Main Power Settings **40–80%**, burst power max **100** → intra-burst strokes at **80%** (top of session envelope). Burst max **0** → **40%**. Random burst **50–100** → **60–80%**.

**What this is not:** burst power does **not** blend with the **current program row** (wave valley, random draw, etc.). Program `(power, gap)` apply to **main** strokes only; burst relative power maps only through **`minimumPower` / `maximumPower`**. Changing main Power Settings min/max changes the absolute stroke strength of the same burst slider values.

**Operator intent:** **Power Settings** define the **min/max envelope for the whole automatic session** — every main stroke and every burst stroke ultimately resolves inside that band. Burst Stroke Power min/max are **usually left at 0 and 100** (use the full session envelope — typical for high-intensity burst clusters). Operators can also set a **lower burst range** (e.g. fixed at 0, or random **0–40**) so burst slots deliver **lighter strokes** — a brief break or softer interlude between heavier main-program strokes, without leaving automatic mode. Fixed vs random burst power (§2.1) controls whether those lighter (or stronger) intra-burst strokes are identical or varied.

**Examples (main Power Settings 40–80%):**

| Burst power min–max | Style | Effect |
|---------------------|-------|--------|
| **0–100** (defaults) | `fixedPowerDelay` @ max | Full-strength burst at **80%** |
| **0–100** | `randomPowerOnly` | Intra-burst strokes anywhere **40–80%** |
| **0–30** | `randomPowerOnly` | Lighter “break” bursts **40–52%** between main strokes |
| **0** | `fixedPowerDelay` | Soft burst at session floor **40%** |

**`resultJson` / `burstDetails`:** record **effective** `powerMin` / `powerMax` (resolved percents in 0–100 absolute scale) for the burst event, not raw burst-relative 0–100 alone.

### Shared / API changes (Phase 10)

| Layer | Today | Phase 10 |
|-------|-------|----------|
| `SomNet.Shared/Enums/BurstStyle.cs` | `FixedPowerDelay` only | Add `RandomPowerOnly`, `RandomDelayOnly`, `RandomPowerAndDelay` |
| `SomNet.UI/.../modes.ts` | `'fixedPowerDelay'` only | Four-value union + dropdown labels |
| Dropdown options | Single option (disabled panel) | Four rows per table above |

**Regression:** Default remains **`fixedPowerDelay`** for new Subs / missing key; saved settings round-trip all four enum strings.

---

## 3. Execution semantics (discussion — lock in §4)

### 3.1 Layering model (recommended baseline)

```text
automatic session loop:
  optional delayBeforeStart
  plan burst slot indices from burstPercent + session envelope   ← NEW (§3.6)
  repeat until stop / end rule / abort:
    program → (power, gapSec) for this cadence step     ← AutomaticProgramBase
    if burstsOn && this step is a burst slot:           ← NEW (scheduled, not random)
        run burst sub-sequence (Burst Settings)           ← NEW sub-FSM
        return to main program
    else:
        single pulse at program power
    wait gapSec (program gap — between cadence steps)     ← unchanged Part 2
```

**Key idea:** The **main program** keeps running its normal rhythm. **Burst events** are **scheduled milestones** inserted at equal spacing; each milestone runs burst logic once, then the session continues on the main program.

### 3.2 Manual burst vs automatic burst (comparison)

| Aspect | Manual `burst` command | Automatic burst (Phase 10) |
|--------|------------------------|----------------------------|
| **Trigger** | Operator clicks Burst | **Scheduled** burst slots evenly spread across program (§3.6) |
| **Power** | Single `powerPercent` all strokes | Per **§2.1** — fixed at max and/or uniform random in burst power range |
| **Stroke count** | Fixed `burstStrokes` | Uniform random in `[burstStrokesMin, burstStrokesMax]` per burst event |
| **Inter-stroke delay** | Fixed `burstDelayMs` | Per **§2.1** — fixed at max and/or uniform random in burst delay range |
| **After sequence** | Command completes; ack once | Returns to automatic loop; program `gapSec` before next step |
| **Session** | Manual session events | Automatic session; **main** stroke count + **burst event** count in `resultJson` (§3.3) |
| **Abort** | Dual ack (burst fail + abort ok) | Abort ends whole automatic session (Part 2 pattern + hub complete) |

### 3.3 Stroke counting, end-session rules, and reporting (locked 2026-09-07)

**Burst strokes do not count** toward End Session **Strokes** or toward the primary main-program stroke tally.

| Counter | What increments it | End Session **Strokes** limit? | In history summary? |
|---------|-------------------|-------------------------------|---------------------|
| **`mainStrokesCompleted`** | Each **main program** single-stroke cadence step | **Yes** — compare to `endSessionValue` when mode = strokes | **Yes** — primary stroke count |
| **`burstEventsCompleted`** | Each **burst event** finished (one scheduled slot) | **No** | **Yes** — burst count |
| **Intra-burst relay pulses** | Each stroke inside a burst | **No** | Optional detail (§3.3.1) |

**End Session **Minutes**:** wall-clock only (unchanged Part 2); burst activity does not add to stroke limit (N/A). Session ends when elapsed ≥ `endSessionValue` minutes.

**End Session **noAutoEnd**:** no stroke cap; main stroke counter still tracked for reporting; burst spacing per P10-D19.

#### 3.3.1 Session summary and `resultJson` (Phase 10 — P10-D20 ☑)

**UI summary:**

```text
Periodic — 80 main strokes, 8 bursts over 25 min (stopped manually).
```

**Recommended `resultJson` — three tiers:**

**Tier 1 — required when `burstsOn`:** `mainStrokesCompleted`, `burstEventsCompleted`, `strokesCompleted` (= main alias), `burstsOn`, plus existing Part 2 fields.

**Tier 2 — aggregate (recommended):** `intraBurstStrokesCompleted`, `burstPercent`, `burstStyle` (config snapshot).

**Tier 3 — optional detail:** `burstDetails[]` capped at **16** entries; each: `index`, `strokesInBurst`, `durationMs`, `style`, `interrupted`, `powerMin`, `powerMax`, `delayMinSec`, `delayMaxSec`. If JSON buffer overflows → Tier 1+2 only + `"burstDetailsTruncated": true` (P10-D26).

**Example:**

```json
{
  "commandKey": "automatic-stop",
  "automaticMode": "periodic",
  "burstsOn": true,
  "burstPercent": 10,
  "burstStyle": "randomPowerOnly",
  "mainStrokesCompleted": 80,
  "burstEventsCompleted": 8,
  "strokesCompleted": 80,
  "intraBurstStrokesCompleted": 47,
  "durationMs": 1500000,
  "endSessionMode": 2,
  "endSessionValue": 100,
  "endReason": "manualStop",
  "burstDetails": [
    {
      "index": 1,
      "strokesInBurst": 6,
      "durationMs": 12200,
      "style": "randomPowerOnly",
      "interrupted": false,
      "powerMin": 42,
      "powerMax": 78,
      "delayMinSec": 2,
      "delayMaxSec": 2
    }
  ]
}
```

Part 2 sessions (`burstsOn: false`) omit burst fields. Same payload on stop ack and `automatic-session-complete` hub events.

### 3.4 Abort and stop during burst — ☑ agreed 2026-09-07

| Action | During main single stroke | During burst sub-sequence |
|--------|---------------------------|---------------------------|
| **Stop** | Finish **current pulse**, then stop session at safe gap (Part 2) | **Finish current burst** (all scheduled intra-burst strokes complete), then stop — no further main strokes or bursts |
| **Abort** | **`relay_->abort()`** immediately; end session | **Abort current pulse immediately**; **cancel** remainder of burst and **no further** main strokes or bursts |

**Stop** is cooperative through the current unit of work (one stroke **or** one full burst). **Abort** cuts off now and ends the session (Part 2 hub / `resultJson` with `endReason=abort`, `interrupted=true`).

**Partial burst on abort:** last `burstDetails[]` entry (if captured) marks `interrupted: true` with `strokesInBurst` completed so far.

### 3.5 Interaction with seven automatic programs

Bursts are **orthogonal** to program selection:

| Program | Normal step | With bursts on |
|---------|-------------|----------------|
| **Periodic** | Max power, max gap | Burst slots run Burst Settings; other steps normal singles |
| **Random\*** | Random power/gap per step | Same; burst slots override that step with burst sequence |
| **Wave / Build-Up** | Pre-computed `(power, gap)` row | Same; burst slots override single pulse for that cadence index |

**Program gap after burst (P10-D4 ☑):** After every burst event, wait the program’s planned **`gapSec`** for the cadence step that owned the burst slot — same logic as Part 2 between main strokes. Intra-burst delays (`bd`) are internal only; they do **not** substitute for program gap. On Random/Wave/Build-Up, use the **`gapSec` from the milestone main stroke’s schedule row** (the value already loaded when that stroke fired). **No program gap** between the milestone main stroke and the burst itself (burst runs immediately after the triggering main pulse).

**Burst power/delay source (P10-D5 ☑):** Intra-burst **power** and **delay** come exclusively from **Burst Settings (§2.1)** — not from the active program row. Burst power 0–100 is **relative to main Power Settings** (`minimumPower`–`maximumPower`); see **§2.2**. Intra-burst delay uses burst delay min/max only; program `gapSec` is for between main strokes and after bursts (P10-D4).

### 3.6 `burstPercent` — evenly spread burst events (locked 2026-09-07)

**Operator model (confirmed):** Percent controls **how many burst events** fire during the session, **equally distributed** across the program — **not** a random roll on each cadence step.

| Percent | Meaning (example) |
|---------|-------------------|
| **10** | **10 burst events** spread evenly across the program envelope |
| **25** | **25 burst events** evenly spread |
| **0** | No burst events (equivalent to bursts off for scheduling) |

**On each burst slot:** run one burst mini-sequence per **Burst Settings** (style, power, delay, stroke count range) → then **return to the main automatic program** until the next scheduled slot.

#### Scheduling (firmware — at `automatic-start` or first cadence step)

1. Derive **program envelope** from End Session mode + value (§3.6.1 strokes, §3.8 minutes, §3.6.2 noAutoEnd).
2. Compute **`burstEventCount`** = **`round(envelope × burstPercent / 100)`** (P10-D18).
3. Compute burst schedule — **cadence indices** (strokes / noAutoEnd) or **wall-clock deadlines** (minutes).

**Example (End Session strokes):** **100** main strokes, **Percent 10** → **10 bursts** triggered as main stroke count reaches **10, 20, 30, …, 100** (each burst replaces or follows that milestone — P10-D21).

**Example (End Session minutes):** **30** minutes, **Percent 10** → **3 bursts** at **10 min, 20 min, 30 min** elapsed (§3.8).

```text
Cadence:  1    2    3   …   10        11  …   20        …   100
          │ single singles … │ BURST │ singles … │ BURST │ … │ BURST │
          └─ main program ──┘ burst └─ main ────┘ burst ──┘
```

#### End Session mode summary

| End Session | Envelope for burst spacing | End condition | Detail |
|-------------|---------------------------|---------------|--------|
| **Strokes** | `endSessionValue` main strokes | `mainStrokesCompleted >= value` | §3.6.1 — burst slots vs main stroke milestones |
| **Minutes** | `endSessionValue` minutes wall-clock | elapsed ≥ value | **§3.8** |
| **noAutoEnd** | Unbounded | Stop/Abort/operator only | §3.6.2 — P10-D19 ☑ agreed |

#### 3.6.1 End Session = **Strokes** — ☑ agreed 2026-09-07

- **`burstEventCount`** = `round(endSessionValue × burstPercent / 100)` (same formula as minutes).
- **`milestoneInterval`** = `endSessionValue / burstEventCount` (when `burstEventCount > 0`).
- After **`mainStrokesCompleted`** reaches **`k × milestoneInterval`** for **`k = 1 … burstEventCount`**, run **one burst event**, then resume the main program.
- **Intra-burst pulses do not increment `mainStrokesCompleted`.**
- Session ends when **`mainStrokesCompleted >= endSessionValue`** (burst events are extra; they do not substitute for main strokes toward the limit).

**Example:** End Session **100** strokes, **Percent 10** → **10 bursts** after main stroke counts **10, 20, 30, …, 100** (interval = 10).

**Edge case (P10-D25):** If the final milestone equals `endSessionValue` (e.g. burst after 100th main stroke), run that burst **then** end session on return to main loop, **or** end immediately at 100 mains without final burst — ☑ **run burst at milestone, then end if `mainStrokesCompleted >= value`** (final burst is the 10th scheduled event).

#### 3.6.2 End Session = **noAutoEnd**

☑ **Agreed (2026-09-07):** repeating cadence interval — burst every **`round(100 / burstPercent)`** main cadence opportunities (10% → every 10th slot). Main stroke counter uncapped; burst events do not count as main strokes.

---

#### What Percent is *not*

- **Not** Bernoulli random each step (`random < burstPercent`).
- **Not** “10% of strokes are burst strokes” — burst **events** are scheduled; each event may contain multiple strokes from burst min/max range.

### 3.7 Timing diagram (one burst event)

**Stroke milestone example** (burst after main stroke 10):

```text
main 9 ── gap₉ ── main 10 ──┬── burst s1 ── bd ── s2 ── bd ── s3 ──┬── gap₁₀ ── main 11 ── …
                             └─ no program gap before burst ────────┘   ↑ P10-D4: same gapSec
                                                                        as after main 10 alone
```

- `bd` = intra-burst delay (seconds → ms in FSM)
- **`gap₁₀`** = program `gapSec` from the milestone row (Periodic: fixed max gap; Random/Wave: that index’s planned gap)
- Intra-burst `bd` values never replace program gap

### 3.8 End Session = **Minutes** — burst spacing (discussion)

☑ **Agreed:** use **wall-clock** spacing across the session duration (same “evenly spread” principle as strokes, but on **time** instead of main-stroke index).

#### 3.8.1 Inputs

| Input | Example |
|-------|---------|
| `endSessionValue` | **30** (minutes) |
| `burstPercent` | **10** |
| `delayBeforeStartSeconds` | Optional delay before timing anchor (same as Part 2 — anchor burst timeline after start delay completes) |

#### 3.8.2 Burst count (same percent formula)

```text
burstEventCount = round(endSessionValue × burstPercent / 100)
```

| End Session (min) | Percent | Burst events |
|-------------------|---------|--------------|
| 30 | 10 | **3** |
| 60 | 10 | **6** |
| 100 | 10 | **10** |

(P10-D18 ☑: use **`round(envelope × burstPercent / 100)`**; if result is 0 and percent > 0, treat as **no bursts** unless envelope is 0.)

#### 3.8.3 Burst deadlines (even spacing) — ☑ agreed 2026-09-07

Let **`T`** = `endSessionValue × 60 × 1000` ms (session wall-clock budget after start delay).

For **`B`** = `burstEventCount` and **`k`** = 1 … **`B`**:

```text
burstDeadlineMs[k] = sessionStartMs + (k × T / B)
```

**Example:** 30 min, 10% → **B = 3** → bursts due at **10 min**, **20 min**, **30 min** after `sessionStartMs`.

```text
0 min          10 min         20 min         30 min
├─ main program ─┤ BURST ├─ main ─┤ BURST ├─ main ─┤ BURST ┤ END
```

#### 3.8.4 When a deadline is reached (runtime)

Main program keeps running (Periodic, Random, Wave, …) with its normal gaps between **main** strokes.

| State | Behavior |
|-------|----------|
| **`WaitingGap`** (between main strokes) | If `millis() >= nextBurstDeadline` → run **burst event** for that slot; do **not** increment `mainStrokesCompleted` for the burst |
| **`Pulse`** (relay ON) | **Do not** interrupt — finish current main stroke (same as Stop policy) |
| **Inside burst sub-FSM** | Wall clock advances; session minute limit still applies |
| **After burst completes** | Enter **`WaitingGap`** with a **fresh full** program `gapSec` for the next main stroke (P10-D4 — do not resume a partial gap that was in progress when a minutes deadline fired); then resume main program; next burst deadline = following slot |

**Late trigger (P10-D22 ☑):** If main program gap is long and `millis()` passes multiple deadlines, run **one** burst per return to `WaitingGap`, then re-check remaining deadlines (avoid burst storm catch-up in one gap).

#### 3.8.5 Session end vs last burst

- Session ends when **`elapsedMs >= T`** (Part 2 minutes rule) — evaluated in `shouldEndSession()` as today.
- If last burst deadline equals session end (e.g. 30 min), **P10-D23 ☑:** run final burst if deadline is due **before** the end-session check on that loop pass (inclusive at T).

#### 3.8.6 Random / wave programs under minutes

Main stroke rate varies; burst times are **fixed on the clock**. Between bursts, the program may complete **many or few** main strokes depending on gaps — that is expected.

Burst schedule is computed **once at start** from minutes + percent; **not** recomputed from actual stroke count.

#### 3.8.7 Minutes burst decisions (locked 2026-09-07)

| # | Question | Choice |
|---|----------|--------|
| P10-D18 | Burst count formula | ☑ `round(envelope × percent / 100)` |
| P10-D22 | Multiple missed deadlines | ☑ One burst per `WaitingGap` pass |
| P10-D23 | Burst at session end time | ☑ Run if due before end rule on same pass |
| P10-D24 | `burstPercent = 0` or count = 0 | ☑ No burst schedule; Part 2 behavior |

**Verification note:** Operator has not used legacy burst mode personally. Minutes spacing (e.g. 30 min / 10% → 3 bursts at 10, 20, 30 min) is **locked on best mathematical fit** — revise if original product author documents different behavior.

---

## 4. Decisions (lock before coding)

| # | Decision | Options | Choice | Date |
|---|----------|---------|--------|------|
| P10-D1 | **`burstPercent` meaning** | Random per step / **evenly spread events** / time-only | ☑ **Evenly spread** — `burstEventCount ≈ envelope × percent / 100`; slots at equal cadence spacing (§3.6) | 2026-09-07 |
| P10-D2 | **End-session stroke count** | All pulses / **main strokes only** | ☑ **Main program strokes only**; intra-burst pulses excluded | 2026-09-07 |
| P10-D3 | **Stop / Abort during burst** | Pulse only / full burst / immediate | ☑ **Stop:** finish current stroke **or** complete current burst, then end; **Abort:** cut pulse now, cancel rest of burst + session | 2026-09-07 |
| P10-D4 | **Program gap after burst** | Always program gap / zero gap / max(burst, program) | ☑ **Always program `gapSec`** — milestone row’s gap after burst; minutes mode: fresh full gap (§3.7, §3.8.4) | 2026-09-07 |
| P10-D5 | **Burst power/delay source** | See **§2.1** burst style table / blend with program power | ☑ **Burst Settings only** for intra-burst power/delay; burst power 0–100 **relative to main `minimumPower`–`maximumPower`** (§2.2); program row unused inside burst | 2026-09-07 |
| P10-D6 | **Session summary** | Stroke count only / **main + burst counts** | ☑ **Main strokes + burst event count**; optional detail from `burstDetails` | 2026-09-07 |
| P10-D7 | **Architecture** | Embed burst FSM in `AutomaticSessionMode` / extract shared `BurstRunner` / delegate to `BurstSequenceMode` | ☐ **Proposed:** embed sub-FSM in `AutomaticSessionMode` (keep one `IExecutionMode` active) | |
| P10-D8 | **`burstsOn: false` payload** | Accept omitted / require explicit false | ☐ **Proposed:** accept omitted as false (Part 2 compatible) | |
| P10-D9 | **API validation** | Reject invalid burst ranges / clamp | ☐ TBD — mirror manual burst caps | |
| P10-D10 | **Firmware version** | `0.10.0-phase10` / other | ☐ **Proposed:** `0.10.0-phase10` | |
| P10-D11 | **UI — burst panel while running** | Read-only (Part 2) / editable (needs §9 live update) | ☐ **Proposed:** read-only while `running` (same as Part 2) | |
| P10-D12 | **Random burst parameters** | `esp_random()` uniform per burst / per stroke | ☐ **Proposed:** new draw each intra-burst stroke and each intra-burst delay (when style randomizes that axis) | |
| P10-D13 | **Burst Style enum** | Four values per §2.1 | ☑ **`fixedPowerDelay`, `randomPowerOnly`, `randomDelayOnly`, `randomPowerAndDelay`** | 2026-09-07 |
| P10-D14 | **Burst min-field UI rules** | Per §2.1 table / always show mins | ☑ Disable mins per style; device uses **max** when min disabled | 2026-09-07 |
| P10-D15 | **Stroke count vs style** | Fixed at max for fixedPowerDelay / always range | ☑ Always **min/max range** (all styles); unchanged by Burst Style | 2026-09-07 |
| P10-D18 | **Burst count rounding** | floor / round / ceil | ☑ **`round(envelope × percent / 100)`** | 2026-09-07 |
| P10-D19 | **noAutoEnd burst spacing** | Repeating stride / no bursts / wall-clock | ☑ Repeating stride — every `round(100/percent)` cadence opportunities | 2026-09-07 |
| P10-D20 | **`resultJson` burst fields** | Minimal / **Tier 1+2+3 (capped array)** | ☑ Tier 1 required; Tier 2 aggregate; Tier 3 `burstDetails[]` max 16; see §3.3.1 | 2026-09-07 |
| P10-D21 | **Stroke-mode burst milestone** | Replace main stroke / **after** N main strokes | ☑ After every **`k × (endSessionValue / burstEventCount)`** main strokes (§3.6.1) | 2026-09-07 |
| P10-D22 | **Minutes — missed deadlines** | Catch up all / one per gap | ☑ **One burst per `WaitingGap` pass** | 2026-09-07 |
| P10-D23 | **Minutes — burst at session end** | Run / skip last slot | ☑ **Run if due before end rule** (same loop pass) | 2026-09-07 |
| P10-D24 | **Zero burst schedule** | — | ☑ **No bursts** when count rounds to 0 | 2026-09-07 |
| P10-D25 | **Final stroke milestone burst** | Skip / run then end | ☑ Run burst at last milestone, then end if mains complete | 2026-09-07 |
| P10-D26 | **`burstDetails` overflow** | Drop array / truncate flag | ☑ Emit Tier 1+2 + `"burstDetailsTruncated": true` if buffer full | 2026-09-07 |

**Inherited (unchanged):** P9-D2 immediate `automatic-start` ack; P9-D4 summary on stop/abort/end only; P9-D1 ack timeouts; abort hub `automatic-session-complete`.

---

## 5. Architecture sketch

### 5.1 Burst slot planner (new)

At session start (alongside wave schedule build), compute **`burstSlotIndices[]`** from `burstPercent` + end-session envelope (§3.6). Sequencer checks **`cadenceStepIndex`** against this set (or equivalent stride for `noAutoEnd`).

### 5.2 Why not reuse `execution_context.startBurst()`

`execution_context` allows **one** active `IExecutionMode`. Starting manual `BurstSequenceMode` during automatic would **replace** `AutomaticSessionMode` — session state and program index would be lost.

**Preferred:** `AutomaticSessionMode` gains nested states:

```text
Idle → StartDelay → WaitingGap ⇄ Pulse
                      ↓
                   BurstPulse ⇄ BurstGap (N strokes)
```

Reuse **relay** APIs and timing patterns from `BurstSequenceMode` (copy or shared helper), not the standalone mode class.

### 5.3 Files (expected touch set)

| Area | Files |
|------|--------|
| Firmware FSM | `automatic_session_mode.cpp/.h` |
| Config parse | `automatic_config.cpp` — remove Part 3 reject; validate burst ranges |
| Programs | `AutomaticProgramBase` — no change if burst wraps `getStrokeParameters` output |
| API | `HardwareCommandPayloadValidator.cs` — allow `burstsOn: true`; validate burst fields |
| UI | `AutomaticControls.tsx` — enable Burst Settings; remove Part 3 placeholder text |
| Tests | Firmware native tests (if any) + UI payload/validation tests |
| Docs | `PROTOCOL.md`, Device Plan §6, Hardware User Guide |

### 5.4 `resultJson` (automatic stop / complete)

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
| 2026-09-07 | §3.3 — main strokes vs burst events; `resultJson` / history fields |
| 2026-09-07 | P10-D3/21/20 locked — stop/abort during burst; stroke milestones; `resultJson` tiers |
