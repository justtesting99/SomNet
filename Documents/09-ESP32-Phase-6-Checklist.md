# ESP32 Firmware — Phase 6 Checklist

**Single-pulse relay GPIO and button polish** — replace Phase 5 software timer with a non-blocking `relay_controller` FSM; wire `SinglePulseMode` to real relay timing; **`abort`** implemented in firmware; confirm debounced button logging and 10 s credential reset still work.

**Parent plan:** [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §6, §9.4, §10  
**Protocol reference:** [`SomNet.Device/docs/PROTOCOL.md`](../SomNet.Device/docs/PROTOCOL.md) §6–7  
**Prior phase:** [09-ESP32-Phase-5-Checklist.md](./09-ESP32-Phase-5-Checklist.md) (complete)  
**Status:** **Signed off** — 2026-09-05 (relay stroke E2E verified; abort/busy E2E → Phase 8; scope calibration TBD)  
**Target output:** Swagger `stroke` → relay energizes for `strokeMs` → de-energizes; serial shows `[RELAY]` FSM; hub stays connected

---

## Phase 6 at a glance

| Item | Value |
|------|--------|
| **Goal** | Real GPIO pulse on **D4** driven by `relay_controller`; `SinglePulseMode` completion tied to relay FSM |
| **Duration** | 1–2 days |
| **Hardware scope** | Same DevKit; relay module on **D4**; button on **D33** (log + credential reset — no local stroke trigger) |
| **Software scope** | `relay_controller.*`, `single_pulse_mode.*`, `command_handler` (`abort`), `main.cpp` loop order, serial `[RELAY]` |
| **Explicitly out of scope** | Burst/automatic modes, UI command wiring, button-initiated strokes, `resultJson` on API wire (Phase 8), token expiry / `wss` (Phase 7) |
| **Blocks** | Phase 7 (resilience) and Phase 8 (UI commands) benefit from proven relay timing |

Update **Status** above and check boxes below as work completes. When Phase 6 is done, update the status line in [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 Phase 6.

---

## Prerequisites

### Completed upstream

- [x] Phase 5 complete — [09-ESP32-Phase-5-Checklist.md](./09-ESP32-Phase-5-Checklist.md)
- [x] Device **paired** and hub **connected**
- [x] Swagger stroke happy path + validation rejects verified (Phase 5 + API ack fix)
- [x] Relay module wired to **D4** — verified energize/de-energize on stroke
- [x] Review plan §6 *Module state machines* — `relay_controller` FSM diagram
- [x] Review plan §6 *Manual single stroke*

### Developer environment

- [x] SomNet API running; ESP32 on same LAN
- [x] Swagger **Authorize** (Dom JWT); test Sub **`Slv66`**
- [x] Serial monitor 115200 baud
- [x] Relay module LED confirms energize/de-energize

### Module state (post–Phase 6)

| Module | Phase 6 result |
|--------|----------------|
| `relay_controller.*` | `micros()` pulse FSM; `[RELAY]` logs; `requestPulse` + callback; `abort()` |
| `single_pulse_mode.*` | Relay-backed completion; measured `actualStrokeMs` in `resultJson` |
| `command_handler.*` | `stroke` + **`abort`** dispatch (abort E2E deferred — Phase 8) |
| `execution_context.*` | `RelayController*` DI; `abortActive()` forwards to mode |
| `button_input.*` | Unchanged — log + 10 s credential reset (not re-tested this session) |
| `main.cpp` | Hub → relay → execution → command → button; `yield()` in loop |

---

## Decisions (set before coding)

| # | Decision | Options | Choice | Date |
|---|----------|---------|--------|------|
| P6-D1 | **`RELAY_ACTIVE_HIGH`** | `true` / `false` (many modules active-LOW) | ☑ **`true`** (active-HIGH) — verified on hardware | 2026-09-05 |
| P6-D2 | **Timing authority** | Mode keeps own timer / **relay_controller only** | ☑ **Relay FSM only** | 2026-09-05 |
| P6-D3 | **`actualStrokeMs` in `resultJson`** | Requested only / **measured at relay OFF** | ☑ Measured at GPIO OFF via **`micros()`** (post–sign-off tweak) | 2026-09-05 |
| P6-D4 | **`abort` commandKey** | Defer / **implement in Phase 6** | ☑ `commandKey: "abort"` — **firmware implemented**; E2E test Phase 8 | 2026-09-05 |
| P6-D5a | **Abort ack (active pulse)** | `success: true` / `success: false` | ☑ **`success: true`**, message `"stroke aborted"` | 2026-09-05 |
| P6-D5b | **Abort ack (idle)** | no-op success / reject | ☑ **`success: false`**, message `"nothing to abort"` | 2026-09-05 |
| P6-D5c | **Stroke ack when aborted** | Stroke REST ack / abort-only ack | ☑ Stroke ack `success: false`, interrupted `resultJson` | 2026-09-05 |
| P6-D5d | **Abort validation** | Full deviceId/token/dom/sub / minimal | ☑ **Same validation as `stroke`** | 2026-09-05 |
| P6-D6 | **Relay completion signal** | Poll flag / **callback** | ☑ **Callback** on normal OFF | 2026-09-05 |
| P6-D7 | **`loop()` order** | Current / **relay before execution** | ☑ Hub → relay → execution → command → button → HTTP | 2026-09-05 |
| P6-D8 | **Overlapping stroke while pulse active** | Reject busy / queue | ☑ **Reject** — E2E test deferred (Swagger blocks parallel requests) | 2026-09-05 |
| P6-D9 | **Firmware version** | e.g. `0.6.0-phase6` | `0.6.0-phase6` | 2026-09-05 |
| P6-D10 | **Button scope** | Local stroke / **log + reset only** | ☑ No local stroke trigger | 2026-09-05 |
| P6-D11 | **Serial prefix for relay** | `[RELAY]` | `[RELAY]` | 2026-09-05 |
| P6-D12 | **Test Sub** | e.g. `Slv66` | `Slv66` | 2026-09-05 |
| P6-D13 | **Dual ack on abort** | One ack / two acks | ☑ Two acks — E2E test Phase 8 | 2026-09-05 |

**Timing note:** Initial build used `millis()` (~+8–9 ms at 5 s). Refined to **`micros()`** + timestamp after `relayWrite(true)` + `yield()` in loop → observed **5000 ms → 5005 ms** on serial. Oscilloscope on D4 recommended for production airline validation (GPIO vs air-line pressure are separate).

**Deferred verification (Phase 8):** `abort` mid-pulse, busy reject — Swagger REST is synchronous (one command at a time); UI or parallel HTTP clients needed.

---

## A. `relay_controller` — non-blocking pulse FSM

- [x] State enum: `Idle` → `On` → callback → `Idle`
- [x] `begin()`: configure `PIN_RELAY`; drive inactive per P6-D1
- [x] `requestPulse(strokeMs)`: reject if busy; energize; log `[RELAY] ON`
- [x] `poll()`: `micros()` elapsed ≥ duration → de-energize; log `[RELAY] OFF after Nms`; callback
- [x] `abort()`: immediate off; log `[RELAY] abort OFF after Nms`
- [x] `isActive()` for busy checks
- [x] `relayWrite(bool energized)` respects `RELAY_ACTIVE_HIGH`

---

## B. `SinglePulseMode` — delegate to relay

- [x] Phase 5 software timer removed (P6-D2)
- [x] `beginStroke()` → `relay_controller.requestPulse()`
- [x] Relay callback → `resultJson` with `actualStrokeMs` (P6-D3)
- [x] Global `relayController.poll()` + callback (P6-D6)
- [x] `abort()` → `relay_controller.abort()` + interrupted `resultJson`
- [x] `isActive()` while pulse active

---

## C. `command_handler` — `abort` command

- [x] Dispatch `commandKey: "abort"` (P6-D4)
- [x] Same validation as `stroke` (P6-D5d)
- [x] Active: dual ack path implemented (P6-D13) — **E2E not run on hardware**
- [x] Idle: `"nothing to abort"` (P6-D5b)
- [x] Other keys → `"not implemented"`

---

## D. Integration — `main.cpp` and wiring

- [x] `ExecutionContext::begin(RelayController*)`
- [x] `relayController.begin()` in `setup()`
- [x] Loop order per P6-D7
- [x] Banner includes `[RELAY]`

---

## E. `button_input` — verify existing behavior

- [ ] Short press `[BTN] pressed` — not re-tested this session (unchanged code)
- [ ] 10 s credential reset — not re-tested this session (unchanged code)
- [x] Button does not trigger relay (P6-D10)

---

## F. Hardware bring-up (P6-D1)

- [x] Relay module toggles on stroke
- [x] Idle state correct with `RELAY_ACTIVE_HIGH = true`
- [x] Documented: `RELAY_ACTIVE_HIGH: true` on test unit

---

## G. Verification tests

### G.1 Happy path — real relay stroke — verified 2026-09-05

- [x] Device paired + hub connected
- [x] `strokeMs: 200` and `5000` — REST success; relay toggles
- [x] Serial: `[RELAY] ON` → `[RELAY] OFF after Nms` → ack
- [x] `actualStrokeMs` in `resultJson` (5000 → 5005 ms after `micros()` refinement)

### G.2 SignalR coexistence — verified 2026-09-05

- [x] `strokeMs: 5000`; hub stays connected during pulse
- [ ] Busy reject — **deferred Phase 8** (Swagger synchronous; code path implemented)

### G.3 Abort mid-pulse — deferred Phase 8

- [ ] Firmware implemented; E2E when UI supports overlapping abort + stroke

### G.4 Regression

- [x] Phase 5 validation rejects still work (prior session)
- [x] Hub stable during long pulse
- [x] Reboot + stroke OK

| Test | Pass? |
|------|-------|
| Relay toggles for stroke | ☑ |
| Swagger success true (happy path) | ☑ |
| `actualStrokeMs` in serial `resultJson` | ☑ |
| Hub connected during long pulse | ☑ |
| Abort opens relay | ☐ deferred Phase 8 |
| Busy reject | ☐ deferred Phase 8 |
| Button log + 10 s reset unchanged | ☐ not re-tested |
| Build clean | ☑ |

**Verification notes (2026-09-05):**

```
Device ID: esp32-84CCA85C36B4
Sub target: Slv66
RELAY_ACTIVE_HIGH: true
5000 ms stroke: actualStrokeMs=5005 (micros() timing)
200 ms stroke: actualStrokeMs≈208 (prior flash, millis())
Abort / busy: deferred — test via UI in Phase 8
Oscilloscope on D4: deferred — before production airline use
Timing offset: TBD after scope — may subtract fixed ms from requested strokeMs
  in relay_controller (poll/callback path) if systematic error confirmed
```

---

## Post sign-off — timing calibration (deferred)

Not blocking Phase 6 or Phase 7 start. Revisit after oscilloscope measurement on **D4** (and optionally air-line pressure).

| Item | Status |
|------|--------|
| Scope validation of GPIO pulse width | Deferred — user to test later |
| Fixed **offset** applied to incoming `strokeMs` | **TBD** — only if scope shows systematic error |
| Where to apply offset | Likely `relay_controller` (threshold or OFF trigger in `poll()` / callback) — decide after scope data |
| `actualStrokeMs` in `resultJson` | Always reports **measured** GPIO time; never inflated by offset |

**Principle:** Do not add compensation code until scope characterizes error (software poll lag vs relay module vs mechanical). Current ~+5 ms at 5000 ms is acceptable for phase exit.

---

## H. Documentation updates

- [x] `SomNet.Device/README.md` — Phase 6 behavior, relay wiring, abort test
- [x] Link Phase 6 checklist from README
- [x] Parent plan §10 Phase 6 status → **Complete**
- [x] [Hardware-User-Guide.md](./Hardware-User-Guide.md) relay section — done 2026-09-05

---

## I. Architecture compliance

- [x] GPIO only in `relay_controller`
- [x] No `delay()` in pulse path (`yield()` in loop)
- [x] `execution_context` owns one active mode
- [x] Burst/automatic stubs unchanged
- [x] Phase 5 validation and ack path preserved

---

## K. Deliverables

- [x] `relay_controller.*` — pulse FSM + abort
- [x] `single_pulse_mode.*` — relay-backed + `actualStrokeMs`
- [x] `command_handler.*` — `abort` dispatch
- [x] `main.cpp` — DI + loop order
- [x] `platformio.ini` — `0.6.0-phase6`
- [x] README updated
- [x] Parent plan §10 Phase 6 status → **Complete**

---

## Phase 6 exit sign-off

| Criterion | Done |
|-----------|------|
| Relay energizes/de-energizes for `strokeMs` (non-blocking) | ☑ |
| Serial FSM trace `[RELAY]` on every transition | ☑ |
| SignalR stays connected during pulse | ☑ |
| `abort` opens relay during active stroke | ☑ implemented; E2E deferred Phase 8 |
| Phase 5 stroke/validation/ack path still works | ☑ |
| Decisions P6-D1–D13 recorded | ☑ |
| No out-of-scope features merged (§J) | ☑ |
| Ready for Phase 7 (resilience / production prep) | ☑ |

**Completed by:** hardware verification (relay stroke E2E); timing offset / scope deferred by agreement  
**Date:** 2026-09-05

---

## Next phase

→ [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 **Phase 7 — Resilience and production prep**

**Phase 8 carry-forward:** verify `abort` dual-ack and busy reject when UI sends commands.

Future phase checklists:

| Phase | Checklist document | Status |
|-------|-------------------|--------|
| 0–5 | Prior checklists | Complete |
| 6 | This document | **Signed off** 2026-09-05 |
| 7 | [09-ESP32-Phase-7-Checklist.md](./09-ESP32-Phase-7-Checklist.md) | Not started |
| 8+ | *Created when prior phase completes* | — |
