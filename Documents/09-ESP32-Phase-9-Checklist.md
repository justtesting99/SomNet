# ESP32 Firmware + SomNet UI — Phase 9 Checklist

**Burst mode (primary)** — implement **`BurstSequenceMode`** on the ESP32: a **deterministic multi-stroke sequence** (fixed count, fixed `strokeMs`, fixed inter-stroke delay) — the natural extension of single stroke. Wire **`burst`** through `command_handler` / `execution_context`; enable the SomNet UI **Burst** button; commit session history from device **`resultJson`**.

**Automatic mode (exploratory / future)** — original concept still evolving. Keep UI **Automatic** controls disabled; retain plan §6 ideas, locked decisions P9-D2/D4/D6, and checklist **Part 2** for when the design is ready (likely Phase 9.x, not Phase 9 sign-off).

**Parent plan:** [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §6, §9, §10 Phase 9  
**Protocol reference:** [`SomNet.Device/docs/PROTOCOL.md`](../SomNet.Device/docs/PROTOCOL.md) — extend for burst (automatic when implemented)  
**Prior phase:** [09-ESP32-Phase-8-Checklist.md](./09-ESP32-Phase-8-Checklist.md) (**Signed off** 2026-09-06)  
**Status:** **Signed off** — 2026-09-06 (`esp32-84CCA85C36B4` / Slv66, firmware `0.9.0-phase9`)  
**Target output:** Dom runs **manual burst** from SomNet UI on paired hardware — **met**

---

## Phase 9 at a glance

| Item | Value |
|------|--------|
| **Goal** | **Burst** E2E — firmware FSM + API timeout + UI Burst button + session from `resultJson` |
| **Duration** | 3–5 days (burst only for sign-off) |
| **Hardware scope** | Same DevKit (`esp32-84CCA85C36B4` / `Slv66`); relay on **D4**; module LED for pulse visibility |
| **Software scope (sign-off)** | `BurstSequenceMode`, `command_handler`/`execution_context`, `SomNet.API` timeout/validation, `SomNet.UI` Manual burst + session parsing |
| **Exploratory (not sign-off)** | `AutomaticSessionMode`, `power_timing` RNG, automatic UI wiring — design TBD from original concept |
| **Explicitly out of scope** | Automatic mode sign-off; two-phase ack (§9); OTA; certificate pinning; QR pairing |
| **Blocks** | Operators using **Burst** from web app (button disabled since Phase 8) |

Update **Status** above and check boxes below as work completes. When Phase 9 is done, update [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 Phase 9.

---

## Prerequisites

### Completed upstream

- [x] Phase 8 **Signed off** — [09-ESP32-Phase-8-Checklist.md](./09-ESP32-Phase-8-Checklist.md)
- [x] Manual **stroke** + **abort** E2E from UI with `resultJson`
- [x] `SinglePulseMode` + `relay_controller` proven non-blocking (Phase 6–8)
- [x] `IExecutionMode` / `execution_context` skeleton with stub mode classes
- [x] UI burst/automatic controls exist but **disabled** with Phase 9 tooltip (P8-D2)
- [ ] Review plan §6 *Manual burst* — payload shape and FSM (primary)
- [ ] Review plan §9.4 — proposed `resultJson` for burst (automatic-stop when implemented)
- [ ] Review `HardwareCommandDispatcher` — **10 s** ack timeout vs long burst duration
- [ ] Skim plan §6 *Automatic mode* — ideas only; no implementation until concept finalized

### Developer environment

- [ ] SomNet API + UI running (local LAN)
- [ ] ESP32 paired + connected (`Slv66` or chosen test Sub)
- [ ] Serial 115200 baud for `[CMD]` / `[RELAY]` / mode transition logs
- [ ] Swagger available for burst/automatic regression before UI wiring

### Current state (entering Phase 9)

| Layer | Today | Phase 9 change |
|-------|-------|----------------|
| **`BurstSequenceMode`** | Stub — `start()` no-op | **Sign-off:** full non-blocking FSM — N pulses + inter-stroke gaps |
| **`AutomaticSessionMode`** | Stub — `start()` no-op | **Future:** leave stub; explore when automatic concept finalized |
| **`power_timing.cpp`** | `strokeMsFromPower()` only | **Future:** RNG helpers for automatic mode |
| **`command_handler`** | `stroke` + `abort` only | **Sign-off:** route `burst`; extend `abort` for burst cancel |
| **`execution_context`** | `startSinglePulse()` only | **Sign-off:** `startBurst()`; one active mode at a time |
| **API ack timeout** | Fixed **10 s** | **Sign-off:** burst formula + caps (P9-D1) |
| **UI Manual Burst** | Disabled + no-op handler | **Sign-off:** `POST burst` + `resultJson` session |
| **UI Automatic Start/Stop** | Local session only (simulated) | **Future:** stay disabled; P9-D2/D4/D6 reserved |
| **UI `SessionProvider`** | Burst still optimistic on click | **Sign-off:** burst after device ack |
| **Firmware version** | `0.8.10-phase8` | **`0.9.0-phase9`** at burst sign-off |

---

## Decisions (locked 2026-09-06)

| # | Decision | Options | Choice | Date |
|---|----------|---------|--------|------|
| P9-D1 | **REST ack timeout for long commands** | Fixed 10 s / per-command formula / config per `commandKey` | ☑ **Per-command formula + caps** — `stroke`/`abort` **15 s**; `burst`: `burstStrokes×strokeMs + (burstStrokes−1)×burstDelayMs + 5 s` margin, **cap 600 s**; `automatic-start` **5 s**; `automatic-stop` **30 s** | 2026-09-06 |
| P9-D2 | **`automatic-start` ack timing** | Immediate ack when engine accepts / wait for first stroke | ☑ **Immediate ack** when config validated and engine running (session async on device) | 2026-09-06 |
| P9-D3 | **Burst abort ack model** | Dual ack (like stroke interrupt) / single burst fail ack only | ☑ **Dual ack** — burst REST returns `interrupted` + `strokesCompleted`; abort REST returns `success: true` | 2026-09-06 |
| P9-D4 | **Automatic stroke aggregation** | Summary only on stop/abort/end rule / per-stroke hub events | ☑ **Summary on stop/abort/end-rule only** (plan §9.4) | 2026-09-06 |
| P9-D5 | **UI payload mapping** | Mirror shared DTO camelCase / server builds from saved settings | ☑ **camelCase from UI state** aligned with `AutomaticControlStateDto`; burst uses plan §6 fields; **omit `running`** from start payload; wire keys `burst`, `automatic-start`, `automatic-stop` | 2026-09-06 |
| P9-D6 | **Automatic burst sub-mode (`burstsOn`)** | Phase 9 / defer to follow-on | ☑ **Deferred** with all automatic work (Part 2) — reject `burstsOn` until automatic phase | 2026-09-06 |
| P9-D7 | **Firmware version scheme** | Single bump / split burst+auto | ☑ **`0.9.0-phase9`** at Phase 9 (burst) sign-off; automatic TBD when implemented | 2026-09-06 |
| P9-D10 | **Phase 9 scope** | Burst + automatic / burst only | ☑ **Burst primary** — Phase 9 sign-off; automatic exploratory (Part 2 / future phase) | 2026-09-06 |
| P9-D8 | **Test Sub** | e.g. `Slv66` | ☑ **`Slv66`** (`esp32-84CCA85C36B4`) | 2026-09-06 |
| P9-D9 | **Max validation limits** | Plan caps / firmware only / custom | ☑ **Plan §6 caps on firmware + API** — `burstStrokes` ≤ 100, `burstDelayMs` ≤ 300 000, auto session hard cap 24 h | 2026-09-06 |

### P9-D10 — burst vs automatic (locked)

- **Burst (manual mode)** = one **deterministic program**: repeat the same stroke (`strokeMs`, power) N times with a fixed gap. Phase 9 sign-off. Natural extension of single stroke.
- **Automatic mode** = a **family of program variations** in timing and power — specifics **not yet defined**. Operator will pick a variation via existing Automatic UI controls (mode dropdown, power/timing ranges, end-session options, optional burst-in-auto settings, etc.). Each selection maps to a **device-side program** the ESP32 runs after a single start message.
- **Different modes** — burst is not a subset of automatic; automatic is not “burst with randomness.” Implement automatic in Part 2 / follow-on phase after burst is stable.

### Automatic mode — design intent (2026-09-06, evolving)

| Aspect | Intent |
|--------|--------|
| **What the operator selects** | A program **variation** through Automatic tab controls and dropdowns (e.g. `automaticMode`, ranges, end-session rules — exact catalog TBD) |
| **What the API sends** | One **config snapshot** describing the chosen program; no server-side stroke timing |
| **What the device runs** | The selected **program** — device generates per-stroke timing/power per that program’s rules until stop, abort, or end condition |
| **What the UI records** | Session summary from device **completion** `resultJson`, not predicted events |
| **Status** | UI layout is **conceptual scaffolding**; firmware `AutomaticSessionMode` remains stub until program definitions are agreed |

### P9-D6 / automatic — execution principle (reserved for future automatic work)

### Reference — options considered

| # | Option A (chosen where ☑) | Option B | Option C |
|---|---------------------------|----------|----------|
| P9-D1 | Per-command formula + caps | Fixed 120 s all commands | Keep 10 s (deferred) |
| P9-D2 | Immediate ack on start | Wait for first stroke | Two-phase ack |
| P9-D3 | Dual ack (match stroke) | Single abort ack only | Other |
| P9-D4 | Summary on stop only | Per-stroke hub events | Other |
| P9-D5 | camelCase UI → device payload | Server builds from saved settings | Other |
| P9-D6 | Basic auto Phase 9; `burstsOn` → 9.1 | Full `burstsOn` in Phase 9 | Defer + silently ignore |
| P9-D7 | 0.9.0 / 0.9.1 split | Single 0.9.0-phase9 | Other |
| P9-D8 | Slv66 | Other Sub | Multiple Subs |
| P9-D9 | Caps firmware + API | Firmware only | Custom caps |

---

# Part 1 — Burst mode (Phase 9 sign-off)

---

## A. Firmware — `BurstSequenceMode`

### A.1 FSM implementation

- [x] Parse payload: `powerPercent`, `strokeMs`, `burstStrokes`, `burstDelayMs`
- [x] Validate caps (P9-D9): reject invalid counts/durations before relay moves
- [x] States: idle → pulse on → pulse off → gap → … → complete (non-blocking `poll()`)
- [x] Delegate relay timing to `relay_controller` (reuse single-pulse path per stroke)
- [x] Track `strokesCompleted` for abort/summary
- [x] `[RELAY]` / `[BURST]` serial transitions for verification

### A.2 Completion + abort

- [x] On complete: callback → `AckCommand` with `resultJson` per plan §9.4 (burst completed)
- [x] On abort mid-sequence: relay open; `interrupted: true`, `strokesCompleted` < requested
- [x] Busy reject if another mode active

---

## B. Firmware — integration (burst)

### B.1 `execution_context`

- [x] `startBurst(correlationId, payloadJson, callback, onComplete)`
- [x] Only one active mode at a time; `poll()` delegates to active `IExecutionMode`

### B.2 `command_handler`

- [x] Route `commandKey: "burst"` → `startBurst`
- [x] Extend `abort` to cancel active burst (P9-D3)
- [x] Payload validation errors → ack `success: false` before relay energizes

### B.3 Regression

- [x] Manual **stroke** + **abort** unchanged (Phase 8 regression)
- [x] Hub reconnect during idle — no regression from Phase 8 (not re-run; burst + stroke verified same session)
- [x] Bump `FIRMWARE_VERSION` to **`0.9.0-phase9`**; flash test device

---

## C. API — dispatcher and validation (burst)

### C.1 Ack timeout (P9-D1)

- [x] Compute timeout for `burst` from payload (formula + 600 s cap)
- [x] Keep `stroke` / `abort` at **15 s**
- [ ] Document timeout behavior in [02-API-Reference.md](./02-API-Reference.md)

### C.2 Server-side validation (P9-D9)

- [x] Reject burst payloads exceeding plan caps before dispatch (mirror firmware)
- [x] Log command key + Sub on dispatch for long-running burst commands

**Note:** `resultJson` pass-through already exists from Phase 8.

---

## D. UI — burst command path

### D.1 ManualControls

- [x] Enable **Burst Strokes** / **Burst Delay** fields when hardware ready
- [x] Remove Phase 9 disable/tooltip from burst controls
- [x] `handleBurst` → `POST /api/devices/commands` with `commandKey: "burst"`
- [x] Payload: `{ powerPercent, strokeMs, burstStrokes, burstDelayMs }` (`burstDelaySeconds × 1000`)
- [x] Pending state for full burst duration (REST blocks until ack — ensure timeout UX message)
- [x] Parse burst `resultJson` → `recordManualBurst` **after** ack (strokesCompleted, interrupted)
- [x] Abort during burst → dual-ack handling (partial burst + abort count)

### D.2 Session + summary

- [x] Add `burstResultJson.ts` for burst fields
- [ ] `sessionSummary.ts` — prefer device `strokesCompleted` when present (uses event count today)
- [x] Failed burst — no optimistic burst entry in session

---

## E. Documentation (burst sign-off)

- [ ] [`PROTOCOL.md`](../SomNet.Device/docs/PROTOCOL.md) — `burst` payload and `resultJson` examples
- [ ] [06-SignalR-And-Hardware.md](./06-SignalR-And-Hardware.md) — `burst` in command keys table
- [ ] [02-API-Reference.md](./02-API-Reference.md) — burst timeout notes
- [ ] [Hardware-User-Guide.md](./Hardware-User-Guide.md) — burst available from web app
- [ ] Parent plan §10 Phase 9 status → **Signed off** when burst complete

---

## F. Verification tests (burst)

### F.1 Manual burst (happy path) — verified 2026-09-06

- [x] Device paired + connected
- [x] Short burst (3 strokes, 201 ms, 2 s gap) from UI → relay pulses on LED
- [x] REST `success: true`; `resultJson.strokesCompleted === 3` (two runs)
- [x] Session history reflects burst **after** ack

### F.2 Burst abort mid-sequence — verified 2026-09-06

- [x] Start long burst (5 strokes, 201 ms, 5 s gap)
- [x] **Abort** after stroke 2 → relay off immediately
- [x] `resultJson`: `interrupted: true`, `strokesCompleted: 2` (requested 5)
- [x] Dual ack: burst `success: false` + abort `success: true`; UI partial burst + abort count

### F.3 Burst busy reject — verified 2026-09-06

**Design:** UI prevents overlapping manual commands while burst is pending — operator cannot start Stroke or a second Burst until burst completes or **Abort** clears pending state. Device `device busy` path exists in firmware but is not exercised from UI (matches Phase 8 F.4 pattern).

- [x] During active burst: **Stroke** disabled (`burstPending`); **Burst** disabled/pending (same `commandKey`)
- [x] No duplicate commands reach device from UI during burst
- [x] After burst complete or **Abort**: Stroke and Burst available again (serial: stroke/burst after abort acks in same session)

### F.4 Regression — verified 2026-09-06

- [x] Manual **stroke** after burst and after abort burst — serial + UI OK
- [ ] Pairing / Hardware dialog unaffected (not re-run)
- [x] SignalR stayalive during burst (hub acks throughout session)

| Test | Pass? |
|------|-------|
| Burst happy path (UI) | ☑ |
| Burst abort mid-sequence | ☑ |
| Burst busy reject (UI blocks) | ☑ |
| Phase 8 stroke/abort regression | ☑ |

**Verification notes (2026-09-06):** Device `esp32-84CCA85C36B4`, Sub `Slv66`, firmware **`0.9.0-phase9`**, power 47% / strokeMs 201. **Happy path:** 3×3 strokes @ 2 s gap — `[BURST] complete success=true`, `strokesCompleted:3`. **Abort:** 5-stroke @ 5 s gap aborted after stroke 2 — `strokesCompleted:2`, `interrupted:true`, dual ack. **Regression:** single strokes at 18:13:52 and 18:16:08 after burst runs. **F.3:** During burst, Stroke and Burst not clickable (UI block); after abort or complete, commands work again (e.g. stroke 18:29:00, burst 18:29:03+ after abort). UI responded as expected throughout.

---

## Phase 9 exit sign-off

| Criterion | Done |
|-----------|------|
| **`burst`** runs full sequence on device; single ack with `resultJson` | ☑ |
| **`abort`** cancels active burst; relay opens; dual ack (P9-D3) | ☑ |
| SomNet UI **Burst** button enabled and wired to REST | ☑ |
| Burst session/history from device **`resultJson`**, not optimistic UI | ☑ |
| No refactor of **`SinglePulseMode`** or **`relay_controller`** required | ☑ |
| Automatic UI remains **disabled** (exploratory / future) | ☑ |
| Decisions P9-D1–D10 recorded | ☑ |
| Phase 8 manual stroke path regression clean | ☑ |

**Completed by:** User + agent verification on hardware  
**Date:** 2026-09-06

---

## Next phase

→ **Part 2** below when automatic concept is finalized, or [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §15 (OTA, deployment)

**Suggested order of work (burst sign-off):** (1) API timeout + burst validation → (2) `BurstSequenceMode` + `command_handler` → (3) Swagger burst → (4) UI burst + session → (5) verification + docs + **`0.9.0-phase9`**

---

# Part 2 — Automatic mode (exploratory / future)

_Not required for Phase 9 sign-off._

**Design intent:** Automatic mode is **not** burst with random gaps. It is a set of **program variations** (timing + power behavior) the operator selects via Automatic tab controls and dropdowns. Each variation becomes a device-side execution program after one start message. **Specific programs are not yet defined** — the current UI (`AutomaticControls`, `AutomaticRunMode`, ranges, end-session, burst-in-auto toggles) is scaffolding for that future catalog.

**Relationship to burst:** Manual **burst** (Part 1) is a fixed, operator-specified multi-stroke sequence. Automatic programs may *include* burst-like behavior as one variation, but automatic and burst remain **separate modes** with separate UI entry points.

Use plan §6, locked P9-D2/D4/D5/D6, and the table above when defining the first automatic program(s).

## G. Firmware — `power_timing` + `AutomaticSessionMode`

- [ ] Define first **automatic program catalog** (which dropdown values map to which device FSM) — **open design**
- [ ] Random / varied timing helpers in `power_timing` as required by chosen programs
- [ ] `AutomaticSessionMode` FSM per selected program variation
- [ ] Optional burst-like sub-behaviors inside a program (e.g. current `burstsOn` UI — semantics TBD)
- [ ] `automatic-start` / `automatic-stop` / abort with summary `resultJson` (P9-D2, P9-D4)

## H. Firmware + API integration (automatic)

- [ ] `execution_context.startAutomatic()` / stop routing
- [ ] `command_handler` routes for `automatic-start`, `automatic-stop`
- [ ] API timeouts for automatic commands (P9-D1 values already chosen)

## I. UI — automatic command path

- [ ] Enable Start/Stop when automatic firmware ready
- [ ] Config snapshot payload (P9-D5); session from stop `resultJson`
- [ ] Keep disabled until Part 2 implementation begins

## J. Verification (automatic — when implemented)

- [ ] Start/stop + summary; end-session rule; abort during automatic
- [ ] Device-side RNG only; UI sync from completion ack
