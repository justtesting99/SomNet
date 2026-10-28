# Motor (H-bridge) actuator — implementation plan & phase checklists

**Status:** **In progress** on `feature/motor-actuator` — derived from [31 — Motor actuator design](./31-Motor-Actuator-Device-Design.md). Check boxes per phase; **do not start the next phase until the prior sign-off block is complete**.

**Git (SomNet repo):** Feature work branches from **`SomEsp`** — e.g. **`feature/motor-actuator`** (merge back to `SomEsp` / `main` per your release flow when phases complete).

| Related | Link |
|---------|------|
| **Design (decisions, MA-D*, payloads)** | [31 — Motor actuator design](./31-Motor-Actuator-Device-Design.md) |
| **Multi-device per Sub (spike)** | [33 — X-6 spike](./33-Multi-Device-Per-Sub-Spike.md) |
| **Operator session / accessory (V2 norm)** | [34 — V2 rules](./34-Operator-Session-And-Accessory-V2-Rules.md) — supersedes P16 / MA-D22 relay-only text for new work |
| Delivery order | **MA-R5:** hub + ESP → standalone → gateway |
| Pins / PWM tuning | [boardDefs.h](../SomNet.Device/include/boardDefs.h) |
| Hub pairing wire | [PROTOCOL.md §4.2](../SomNet.Device/docs/PROTOCOL.md) |
| Gateway / TheSystem (M3) | [30 — Main app integration](./30-Main-App-Device-Gateway-Integration.md) |
| Relay automatic reference | [09-ESP32-Phase-9-Part2-Automatic-Checklist.md](./09-ESP32-Phase-9-Part2-Automatic-Checklist.md) |

---

## 1. Plan at a glance

| Phase | Step (MA-R5) | Goal | Gate to next |
|-------|----------------|------|----------------|
| **M0** | 1 — Hub + ESP | Motor backend, NVS `actuatorKind`, caps, manual PWM/stop | **Sign-off M0** |
| **M1** | 1 — Hub + ESP | Registration + periodic automatic + motor UI/API + `resultJson` | **Sign-off M1** → standalone allowed |
| **M1b** | 1 (optional) | Random motor mode + duty **ramp** FSM (MA-D14) | Optional before or after M2 |
| **M1d** | 1 — Bursts | Motor automatic **bursts** + doc 36 **placement** (BP-E) | **Sign-off M1d** (can parallel M2 prep) |
| **M2** | 2 — Standalone | `/api/local/*` + `/operate` parity for motor NVS profile | **Sign-off M2** → gateway allowed |
| **M3** | 3 — Gateway | TheSystem + gateway pass-through, presets, parallel `deviceId`s | **Sign-off M3** |
| **M4** | 3 — Polish | Reverse (D26/D14), Hall count end mode, straps — **product optional** | Per product |

**Binary:** One firmware image; relay + motor code paths; **one active FSM + driver** per unit (MA-D3, MA-D7, MA-D10).

**Test primary:** SomNet **web API / UI** during M0–M1 (MA-D17). Bench hardware can lag behind Serial/log bring-up.

---

## 2. Cross-cutting work (all phases)

Track once; reference from phase checklists.

| ID | Item | Owner / area | Status |
|----|------|----------------|--------|
| **X-1** | `ActuatorKind` enum in `SomNet.Shared` (`relay`, `hbridge`) | Shared | **Done** |
| **X-2** | Motor program DTO sketch (`minimumDutyPercent`, `maximumDutyPercent`, `rampMs`, `endSessionMode` minutes/noAutoEnd — MA-D19, MA-D20) | Shared + PROTOCOL | **Done** (DTO + PROTOCOL) |
| **X-3** | Motor `resultJson` + summary builder (separate from relay) | Firmware + Shared + API | **Done** (v1 periodic) |
| **X-4** | Relay regression: relay NVS profile unchanged on same binary | Firmware CI / manual | **Done** — Run A R0–R11 **2026-10-27** (operator) |
| **X-5** | `boardDefs.h`: `MOTOR_PWM_FREQUENCY_HZ`, `MOTOR_ENABLE_ACTIVE_HIGH` tuned on module (MA-D18) | Firmware / bench | 5 kHz PWM validated; duty **>50%** very fast on production motor — operator using **~10%** until max-duty cap/tuning (MA-D18 follow-up) |
| **X-6** | **Multi-device per Sub** — [33](./33-Multi-Device-Per-Sub-Spike.md) **signed off** 2026-10-26; **X-6.1–X-6.6** + same-Sub bench (H1 per-device session rows) | API + UI + docs | **Done** — §2.3 S4 **2026-10-27** |
| **X-6i** | **Dual-Sub bench UI** — switching `selectedSub` must not leak session row, `running`, or Start/Stop state to the other Sub (until true multi-device-per-Sub). See §2.2 | SomNet.UI | **Done** (2026-10-26, operator verified) |
| **X-7** | Motor automatic **burst + placement** design ([31 §5.2.1](./31-Motor-Actuator-Device-Design.md#521-bursts-in-motor-automatic-design-locked-2026-10-27), [36 BP-E](./36-Burst-Placement-Modes-Design.md#8-motor-bp-e--phase-m1d)) | Docs | **Design ☑** — firmware **M1d** |

**Bench note:** **Primary** regression path is **relay + motor on the same Sub** (`Slv66`, device picker) — operator verified independent scene/motion **2026-10-27**. **X-6i** dual-Sub switching remains valid for Sub-isolation tests.

### 2.2 Dual-Sub UI scoping (X-6i — interim until X-6)

Required for parallel motor + relay regression on one Dom account. **Does not** change hub routing (still one `deviceId` per Sub).

| ID | Behavior | Status |
|----|----------|--------|
| **X-6i-1** | `activeSession` in UI applies only when `session.subTarget` matches **selected Sub** | Done |
| **X-6i-2** | Tab-sync `running` includes **`subTarget`** + **`deviceId`** + **`kind`**; ignore foreign Sub/device | Done (X-6.6) |
| **X-6i-3** | Session accessory “device automatic running” uses **paired actuator** for selected Sub (motor vs relay flag) | Done |
| **X-6i-4** | Automatic Start/Stop gated on **`settingsLoaded`** for selected Sub (no stale `running` flash on switch) | Done |
| **X-6i-5** | Operator: motor session on Sub A + switch to Sub B → B shows idle controls; switch back → A still in progress if device still running | **Verified 2026-10-26** |

**Code touchpoints (reference):** `SessionProvider` (`sessionForSub`), `TabSyncProvider` / `tabSync`, `DeviceSubSessionControls`, `DeviceOperationsPanel`, `MotorAutomaticControls` / `MotorManualControls` / `AutomaticControls`, `OptionsProvider.setDeviceAutomaticRunning`, `useOperationSession.ensureAutomaticSessionForDeviceStart`.

### 2.3 Spike X-6 — multi-device per Sub (gate before M1b / M2 / M3)

**Treat as a spike, not a side task:** agree how **one Sub** hosts **many `deviceId`s** (two motors in one session, relay vs motor usually exclusive, future linear actuator) **before** expanding motor modes (M1b) or copying patterns to standalone/gateway (M2/M3).

| Step | Action | Status |
|------|--------|--------|
| **S1** | Read & review [33 — Multi-device per Sub spike](./33-Multi-Device-Per-Sub-Spike.md) (use cases UC-1–UC-5, §4 model, §5 slices) | ☑ |
| **S2** | Resolve **Q1–Q7** in [33 §7](./33-Multi-Device-Per-Sub-Spike.md) | ☑ 2026-10-26 |
| **S3** | **Spike sign-off** ([33 §8](./33-Multi-Device-Per-Sub-Spike.md)) | ☑ 2026-10-26 |
| **S4** | Implement **X-6.1** → **X-6.6** per agreed order | ☑ **2026-10-27** — all slices landed (history **X-6.4** H1: filter + display `deviceId`) |

**Phase gates (until S3 complete):**

| Phase | Rule |
|-------|------|
| **M1b / M1c** | **Unblocked** — X-6 complete; modes + pattern graph shipped on hub path |
| **M2** | **Unblocked** — standalone API parity should follow **deviceId** routing from X-6.2 |
| **M3** | **Blocked on M2**; gateway already has P7-D2 — align session/history with spike §4.6 |
| **M1 / X-4** | **Complete** — Run A + Run B signed off **2026-10-27** |

### 2.1 Relay regression runbook (X-4 / M0-V2)

Same **`pio run -e dev`** binary as the motor ESP; NVS **`actuatorKind` = `relay`** (default for unbound units; confirm in Hardware pairing or serial banner).

| Step | Action | Pass criteria |
|------|--------|----------------|
| R0 | **`accessToken mismatch`** or **`actuatorKind rejected (NVS=hbridge pair=relay)`** | **Revoke** on target Sub (clears `act_kind` on device), then **Pair** correct profile while hub connected; expect `[HUB] paired dom=… sub=…` |
| R1 | Flash relay ESP (`pio run -e dev -t upload`) | Boot banner: `Actuator: relay`; hub connects |
| R2 | Pair/register as **Relay** on **relay Sub** (not motor Sub) | UI Hardware shows `relay`; hub status `actuatorKind: relay` |
| R3 | Session accessory ON (button or UI) | `[ACCESSORY] ON`; motion not rejected for accessory |
| R4 | **Manual** — stroke (and burst if used) | Relay clicks / load behaves; `[CMD] ack` success |
| R5 | **Automatic** — short relay program (e.g. random, 1–2 min end) | Segments run; Stop or natural end; history summary |
| R6 | **Abort** during automatic | Relay off; `resultJson` / session complete path |
| R7 | **Negative** — hub must not drive motor on this unit | `motor-run` / motor-shaped automatic → device **`actuator kind mismatch`** (or API blocks before dispatch) |
| R8 | Idle / sign-off | No motor motion on D25–D27; relay idle when disarmed; optional: `[MOTOR] backend ready` in serial only |
| R9 | **Dual-Sub UI (optional)** — motor automatic running on motor Sub; switch to relay Sub | Relay Sub: Start enabled, no false “in progress”; switch back restores motor state if still running (X-6i) |

Record deviceId, Sub, and date in **X-4** row when **Run A** (§2.4) passes.

#### X-4 sign-off record

| Field | Value |
|-------|--------|
| **Date** | 2026-10-27 |
| **Signed by** | Operator (bench) |
| **Sub** | `Slv66` (same-Sub relay + motor) |
| **Relay `deviceId`** | *(relay unit on roster — paired as relay)* |
| **Firmware** | Unified `env:dev`; `feature/motor-actuator` @ `5b407ec` |
| **Runbook** | R0–R8 ☑; R10–R11 ☑ (same-Sub); R9 N/A |
| **Notes** | V2: motion with scene on, accessory optional. Operator: all Run A steps pass. |

### 2.4 Operator sign-off runs (execute on bench)

Use these **in order** for option **A** (formal sign-off). Check each box in your notes; only then complete the sign-off tables above/below and update §9.

#### Run A — **X-4** relay regression (same binary as motor)

**Unit under test:** relay-profile ESP only. **Binary:** `pio run -e dev` (same image flashed to motor units).

| ☐ | Step | What to do | Pass |
|---|------|------------|------|
| ☑ | **R0** | If pair/kind errors | Revoke → re-pair as **relay** while hub connected |
| ☑ | **R1** | Flash relay ESP | Serial: `Actuator: relay`; hub connects |
| ☑ | **R2** | Hardware pairing | UI shows `actuatorKind: relay` for this `deviceId` on intended Sub |
| ☑ | **R3** | **Accessory** ON (optional) | `[ACCESSORY] ON`; **V2:** stroke/automatic still allowed with accessory **OFF** (scene on + ready) |
| ☑ | **R4** | Manual stroke (± burst) | Relay actuates; command ack success |
| ☑ | **R5** | Automatic — short program | Segments run; history/summary on stop or end |
| ☑ | **R6** | **Abort** during automatic | Relay stops; session/result path completes |
| ☑ | **R7** | Negative | Motor-shaped command to **this** `deviceId` rejected (device or API) |
| ☑ | **R8** | Idle | No motor pins active; relay idle when disarmed |

**Same-Sub bench (recommended with motor paired):**

| ☑ | **R10** | Motor automatic **running** on motor `deviceId`; switch picker to **relay** | Relay panel idle; relay **Start** works; **Abort** visible while relay automatic runs |
| ☑ | **R11** | Switch back to motor while relay idle | Motor state still correct (not cleared by relay tab) |

When all required rows pass → fill **§2.1 X-4 sign-off record** and set **X-4** row in §2 to **Done**.

#### Run B — **M1** hub motor sign-off (after Run A recommended)

**Unit under test:** motor-profile ESP (`actuatorKind: hbridge`). **Exit (M1):** periodic automatic via **SomNet UI/API** + `resultJson`. **Extended:** M1b modes + M1c graph — see §5 / §5.1.

| ☐ | Step | What to do | Pass |
|---|------|------------|------|
| ☑ | **M1-B1** | Pair/rebind | Register as **motor**; revoke+motor re-pair works if needed |
| ☑ | **M1-B2** | Scene + ready | Double-click device; **Scene** on; motion not blocked by accessory off |
| ☑ | **M1-B3** | Periodic automatic | Start → duty ramp/segments visible on bench; **Stop** cooperative path OK |
| ☑ | **M1-B4** | **Abort** | PWM off; session completes |
| ☑ | **M1-B5** | History | Completed session shows motor summary / `segmentsCompleted` (or equivalent) |
| ☑ | **M1-B6** | UI kind | Relay-only automatic controls hidden when motor selected |
| ☑ | **M1-B7** | Negative | Relay automatic payload to motor `deviceId` rejected |
| ☑ | **M1-B8** | Same-Sub | With relay on same Sub: independent start/stop per device (UC-1) |

When **M1-B1–B8** pass → fill **§4 Phase M1 sign-off** (☑ all M1 items) and update §9 **M1** row.

**Not part of M1 sign-off:** M0 phase sign-off (M0-F2/F5 still open), M1b random modes, M2 standalone.

---

## 3. Phase M0 — Motor backend & discovery

**Exit (from doc 31):** Manual PWM/stop from **`/operate`** or hub manual path; Serial shows D25/D27 activity; D26/D14 idle; caps report `actuatorKind: hbridge` when provisioned.

### 3.1 Firmware (`SomNet.Device`)

- [x] **M0-F1** NVS key `actuator_kind` (`relay` \| `hbridge`); read at boot; default `relay` for existing units. *(NVS key `act_kind`; config POST `actuator_kind`.)*
- [ ] **M0-F2** Boot: select **one** backend + gated init (relay **or** motor per NVS) — MA-R7. *(Both drivers `begin()`/`poll()` today; dispatch gated by NVS.)*
- [x] **M0-F3** `MotorController` / `MotorBackend`: LEDC PWM on `PIN_MOTOR_PWM`; enable outputs `PIN_MOTOR_ENABLE` (+ secondary pins held inactive v1).
- [x] **M0-F4** **MA-D15:** disarmed / aborted / idle → PWM 0, enables **inactive** (`MOTOR_ENABLE_ACTIVE_HIGH`).
- [ ] **M0-F5** Manual commands (hub and/or `/operate`): motor run/stop at duty % — route only when NVS = `hbridge`. *(Hub `motor-run` / `motor-stop` done; `/operate` UI still relay-only.)*
- [x] **M0-F6** Reject relay `stroke` / relay-shaped automatic payload when NVS = `hbridge` (and vice versa).
- [x] **M0-F7** Extend **`GET /api/local/caps`** (and device status if applicable): `actuatorKind`, motor duty limits (placeholder OK). *(Caps only; status JSON not extended yet.)*
- [x] **M0-F8** Serial diagnostics: `[MOTOR]` PWM/enable state for bench without PCB optional.

### 3.2 Protocol & docs

- [x] **M0-P1** PROTOCOL draft: motor caps fields; manual command keys; link from [31](./31-Motor-Actuator-Device-Design.md).

### 3.3 Verification

- [x] **M0-V1** Flash **same** `env:dev` binary; set NVS to `hbridge` (config tool or temporary API); manual stop clears PWM + enable. *(Run B M1-B3/B4 — **2026-10-27**.)*
- [x] **M0-V2** Relay-profile device on same binary: relay behavior unchanged (X-4). *(Run A — **2026-10-27**.)*

### Phase M0 sign-off

| Field | Value |
|-------|--------|
| **Date** | |
| **Signed by** | |
| **Firmware version / git** | |
| **Hardware** | ☐ Module on bench ☐ Serial-only |
| **Notes** | |
| **All M0 items complete** | ☐ |

---

## 4. Phase M1 — Hub path: registration + periodic automatic

**Exit:** Paired motor unit; **periodic** automatic session end-to-end via **SomNet UI/API**; `resultJson` on completion; pair flow sets `actuatorKind`.

### 4.1 Registration & NVS (MA-D12)

- [x] **M1-R1** `PairDeviceRequestDto` + `PairDeviceMessageDto`: **`actuatorKind`**.
- [x] **M1-R2** `POST /api/devices/pair`: accept `actuatorKind`; persist on server device record.
- [x] **M1-R3** SomNet.UI Hardware pairing: **“Register as relay or motor?”** control.
- [x] **M1-R4** Firmware `PairDevice` handler: write NVS if unbound; **reject mismatch** if already bound.
- [x] **M1-R5** Rebind: **Revoke** clears NVS pairing + `act_kind`; re-pair may bind new `actuatorKind`. Factory reset still clears all NVS.
- [x] **M1-R6** PROTOCOL §4.2 updated with `actuatorKind` in `PairDevice` arguments.

### 4.2 Firmware — motor automatic FSM

- [x] **M1-F1** Separate **motor automatic FSM** (do not overload relay-only `AutomaticSessionMode` indefinitely) — MA-D10. *(`MotorAutomaticSessionMode`.)*
- [x] **M1-F2** `automatic-start` validation: NVS `hbridge` + motor JSON schema.
- [x] **M1-F3** **Periodic** mode for first bench sign-off (MA-D14 first ship). *Extended in **M1b** to all motor modes below.*
- [x] **M1-F4** `endSessionMode`: **`minutes`** and **`noAutoEnd`** only — **no** rotation/stroke count (MA-D20).
- [x] **M1-F5** `automatic-stop` / abort: MA-D4 (PWM off, enables low).
- [x] **M1-F6** Terminal **`resultJson`** (motor schema — PROTOCOL); hub ack / session complete path like relay.
- [x] **M1-F7** Ramp hook in FSM structure (`rampMs` in payload; linear ramp up/down per segment on bench motor). *Validate on BTS7960 ESP #2; random modes remain **M1b**.*

### 4.3 SomNet.Shared & API

- [x] **M1-S1** `MotorAutomaticControlStateDto` (or equivalent) — separate from `AutomaticControlStateDto` (MA-R6).
- [x] **M1-S2** API validation on hub command dispatch for motor vs relay device registration.
- [x] **M1-S3** Motor session summary builder for history (parallel to relay). *(`segmentsCompleted` in Shared + UI summary.)*

### 4.4 SomNet.UI

- [x] **M1-U1** Motor automatic form: duty min/max, segment timing, end session (no stroke-ms; no count end mode). *Per-Sub `motorAutomatic` pairing settings + operation mode on refresh (2026-10-26).*
- [x] **M1-U2** Hide relay-only controls when device/caps `actuatorKind` = `hbridge`. *(`DeviceOperationsPanel` + `MotorAutomaticControls` / `MotorManualControls` per device scope.)*
- [x] **M1-U3** Start / Stop / Abort E2E on paired motor device. *(Hub: `esp32-84CCA85C36B4` → Slv67; production bench `esp32-7C9EBD398F08` → Slv66, BTS7960, button accessory + periodic ramp + abort.)*
- [x] **M1-U4** Dual-Sub bench: switch Sub without cross-contaminating the other device’s session / automatic running UI (X-6i). *(Dual-Sub **2026-10-26**; same-Sub relay+motor device switch **2026-10-27** — independent scene/motion.)*

### 4.5 Tests

- [x] **M1-T1** Unit/integration tests for motor DTO validation (API or Shared).
- [x] **M1-T2** Manual test script or checklist run recorded (pair → arm → periodic → result). *(2026-10-26 Slv67/Slv66; **2026-10-27** Run B M1-B1–B8 operator pass.)*

### Phase M1 sign-off

| Field | Value |
|-------|--------|
| **Date** | 2026-10-27 |
| **Signed by** | Operator (bench) |
| **Firmware / API / UI versions** | `feature/motor-actuator` @ `5b407ec`; unified `env:dev` ESP image |
| **Test deviceId** | Motor `esp32-7C9EBD398F08`; relay on same Sub `Slv66` (Run A) |
| **Notes** | Periodic + ramp + Stop/Abort + history; V2 scene per device; UC-1 same-Sub with relay. M1b/M2 still gated on X-6.3–X-6.6 for host polish / dual-motor settings. |
| **All M1 items complete** | ☑ |

---

## 5. Phase M1b — Motor program modes + ramp (hub path)

**Prerequisite:** [X-6](./33-Multi-Device-Per-Sub-Spike.md) **X-6.3** (per-device settings) — **done 2026-10-27**.

**Exit:** Motor programs beyond periodic — random speed/timing, wave, build-up — with **linear speed ramps** between segment targets (MA-D14). Bursts → **Phase M1d**.

- [x] **M1b-F1** Motor modes in `MotorAutomaticSessionMode`: `randomSpeed`, `randomSpeedAndTiming`, `powerWave`, `buildUp` (+ `periodic`).
- [x] **M1b-F2** DTO + PROTOCOL: `minimumSpeedPercent` / `maximumSpeedPercent`, `rampMs`, segment seconds; API motor mode validation.
- [x] **M1b-F3** Motor **`automatic-update`** (`queueSessionUpdate`) while session active.
- [x] **M1b-U1** `MotorAutomaticControls` mode selector + `motorAutomaticFieldRules.ts` (mode-specific min/max segment rules, wave/build-up end-session constraints).
- [x] **M1b-U2** `MotorManualControls` + hub `motor-run` / `motor-stop` (M0 manual path on hub).
- [ ] **M1b-F4** Motor automatic **bursts** — moved to **Phase M1d** (see §5.2); was deferred under M4.
- [x] **M1b-V1** E2E random/wave sessions on bench + history `resultJson`.

### Phase M1b sign-off (optional)

| Field | Value |
|-------|--------|
| **Date** | 2026-10-27 |
| **Signed by** | Operator (bench) |
| **Skipped for MVP?** | ☐ — modes shipped; bursts tracked in **M1d** |
| **All M1b items complete** | ☑ (bursts → **M1d**) |

---

## 5.1 Phase M1c — Pattern graph & segment telemetry (hub UI)

**Exit:** Operator **commanded speed %** graph in video column; live curve from device segment acks during automatic run.

- [x] **M1c-F1** Firmware `emitSegmentRamp` → hub ack `correlationId: motor-automatic-segment` ([PROTOCOL §6.9](./../SomNet.Device/docs/PROTOCOL.md)).
- [x] **M1c-S1** `HardwareCommandKeys.MotorAutomaticSegmentCorrelationId` in Shared.
- [x] **M1c-U1** `AutomaticSessionHubListener` → `motorAutomaticSegmentStore`; `MotorPatternGraphPanel` + `MotorSpeedPatternChart`.
- [x] **M1c-U2** Preview schedule (`motorSpeedSchedule.ts`); **Now** marker + zoom/pan (`motorPatternRunAnchor.ts`, `motorChartViewRange.ts`).
- [x] **M1c-U3** Video aside **Feeds \| Graph** tab; `videoAsideTabStorage.ts` (`localStorage`, hydrate after device roster loaded).
- [x] **M1c-D1** Scope documented in [03 — Frontend § Motor pattern graph](./03-Frontend-Architecture.md#motor-pattern-graph-scope) and [31 §13](./31-Motor-Actuator-Device-Design.md#13-as-built--hub-path-motor-programs-ui-telemetry).

### Phase M1c sign-off

| Field | Value |
|-------|--------|
| **Date** | 2026-10-27 |
| **Signed by** | Operator (API/UI path) |
| **Requires** | Motor firmware flashed with segment notifier; UI `dist` rebuilt when API hosts static bundle |
| **All M1c items complete** | ☑ |

---

## 5.2 Phase M1d — Motor automatic bursts + placement (BP-E)

**Prerequisite:** **M1b** signed off (segmented modes + `automatic-update`). Relay burst placement shipped — [36](./36-Burst-Placement-Modes-Design.md), firmware **`0.15.2-burst-main-timing`**.

**Design (locked 2026-10-27):** [31 §5.2.1 — Bursts in motor automatic](./31-Motor-Actuator-Device-Design.md#521-bursts-in-motor-automatic-design-locked-2026-10-27) (MA-D25–D27).

**Exit:** Motor device executes `burstsOn` with all **six** `burstPlacement` values (segmented modes); **periodic** supports **session spread + minutes** only; interim reject or full implementation; pattern graph preview includes bursts.

### 5.2.1 Design & product

- [ ] **M1d-D1** Operator sign-off on §5.2.1 (main beat, periodic matrix, burst cluster shape)
- [ ] **M1d-D2** PROTOCOL / `boardDefs` note for burst micro-hold ms once bench value chosen (MA-D26)

### 5.2.2 Firmware (`MotorAutomaticSessionMode`)

- [ ] **M1d-F1** Parse `burstsOn`, `burstPlacement`, burst percent/style/ranges in `parseMotorAutomaticConfig`
- [ ] **M1d-F2** Until burst FSM complete: **reject** `burstsOn: true` with clear serial (remove when done)
- [ ] **M1d-F3** Motor config adapter → shared `buildAutomaticBurstPlan` / replan (`automatic_burst_runtime`)
- [ ] **M1d-F4** Burst sub-FSM: micro-cycles (ramp → hold → intra-gap) using `MotorController` ramps (MA-D14)
- [ ] **M1d-F5** **Main+** triggers after segment complete; **instead-of** before next `beginSegmentTransition`
- [ ] **M1d-F6** Wall-clock **session spread** in `poll` between segment work
- [ ] **M1d-F7** **Chance** rolls at same hook points as relay (`esp_random`)
- [ ] **M1d-F8** `automatic-update` rebuilds burst plan (Phase 11 parity)
- [ ] **M1d-F9** `resultJson`: `burstEventsCompleted`, `burstPlacement` echo
- [ ] **M1d-F10** `emitSegmentRamp` during burst clusters (live graph parity)

### 5.2.3 Shared / API

- [ ] **M1d-S1** `MotorAutomaticControlStateDto` / pairing serializer — verify burst fields (likely already ☑)
- [ ] **M1d-S2** Motor automatic history / summary strings mention burst events when present

### 5.2.4 UI

- [ ] **M1d-U1** `motorSpeedSchedule.ts` — burst preview using shared placement helpers (`burstPlacement.ts` / `relayBurstPlan` logic)
- [ ] **M1d-U2** `MotorAutomaticControls`: disable even/chance placements when mode = periodic (MA-D27)
- [ ] **M1d-U3** Remove “settings only / not on device” banner when **M1d-F4** ships

### 5.2.5 Tests & bench

- [ ] **M1d-T1** API validator tests for motor + `burstsOn` (extend existing burst placement tests)
- [ ] **M1d-T2** TS unit tests for motor burst preview schedule
- [ ] **M1d-V1** Bench segmented mode: `mainPlusAfterMainStroke` vs `insteadOfAfterMainStroke` (50%, minutes)
- [ ] **M1d-V2** Bench periodic: `mainPlusSessionSpread` + 1 min (wall-clock cluster only)
- [ ] **M1d-V3** Chance mode smoke on `randomSpeed` (serial + graph)

### Phase M1d sign-off

| Field | Value |
|-------|--------|
| **Date** | |
| **Signed by** | |
| **Firmware version** | (target e.g. `0.16.0-motor-burst`) |
| **Test deviceId** | |
| **Notes** | |
| **All M1d items complete** | ☐ |

---

## 6. Phase M2 — SomEsp standalone (local API)

**Prerequisite:** **M1 sign-off** complete **and** [X-6 spike sign-off](./33-Multi-Device-Per-Sub-Spike.md) (§2.3). Implementation should follow **X-6.2** `deviceId` routing semantics where applicable.

**Exit:** Motor unit with `actuatorKind=hbridge` in NVS operates via **`/api/local/*`** and **`/operate`** without hub — behavior matches M1 hub path (MA-R6 shell, motor program body).

### 6.1 Firmware

- [ ] **M2-F1** `env:somesp` same binary family; motor NVS profile on standalone build.
- [ ] **M2-F2** `/api/local/unlock`: first bind may set `actuatorKind` (MA-D12 LAN path).
- [ ] **M2-F3** `/api/local/commands`: `automatic-start` / stop motor parity with hub.
- [ ] **M2-F4** PIN, arm/disarm, lock, stop/abort, `resultJson` match M1 semantics.

### 6.2 Docs & verification

- [ ] **M2-D1** [27 — SomEsp](./27-SomEsp-Standalone-Device-Plan.md) cross-link motor profile.
- [ ] **M2-V1** curl/runbook recipe: unlock → arm → periodic motor run (no SomNet.API).

### Phase M2 sign-off

| Field | Value |
|-------|--------|
| **Date** | |
| **Signed by** | |
| **Firmware version** | |
| **Notes** | |
| **All M2 items complete** | ☐ |

---

## 7. Phase M3 — Gateway & TheSystem

**Prerequisite:** **M2 sign-off** complete.

**Exit:** `automatic/run` on motor `deviceId`; TheSystem registration + motor preset; relay + motor **parallel** jobs (P7-D2); runbook updated.

### 7.1 Gateway (`TheSystem` repo)

- [ ] **M3-G1** Motor row in `Device:Devices[]`; pass-through motor JSON on `RunAutomaticAsync`.
- [ ] **M3-G2** Reject relay preset body to motor `deviceId` (optional caps probe).
- [ ] **M3-G3** Optional `GET /api/v1/devices` includes `actuatorKind` from caps cache.

### 7.2 TheSystem

- [ ] **M3-T1** EF/device registry: `ActuatorKind` on registration ([registry doc](../../TheSystem/Docs/SOMNET_DEVICE_REGISTRY.md)).
- [ ] **M3-T2** Admin add device: **relay or motor?**; presets per kind.
- [ ] **M3-T3** `SomNetVOController` / admin UI: motor preset + run + stop/abort.
- [ ] **M3-T4** Run history: motor `ParametersSnapshot` + `ResultJson` + kind column.

### 7.3 SomNet.Shared & docs

- [ ] **M3-S1** `IDeviceGatewayClient` motor overload or JSON document path documented.
- [ ] **M3-D1** [30 §5](./30-Main-App-Device-Gateway-Integration.md) + [runbook §9](./SomNetIntegrationRunbook.md) motor recipes.

### 7.4 Verification

- [ ] **M3-V1** Scheduled or admin motor run via gateway while relay `deviceId` idle (or parallel).
- [ ] **M3-V2** Kind mismatch blocked (registration vs caps vs payload).

### Phase M3 sign-off

| Field | Value |
|-------|--------|
| **Date** | |
| **Signed by** | |
| **Gateway / TheSystem versions** | |
| **Notes** | |
| **All M3 items complete** | ☐ |

---

## 8. Phase M4 — Polish & future (optional)

Not required for first motor MVP. Sign off per item if pursued.

| ID | Item |
|----|------|
| **M4-1** | Reverse direction (D26/D14) + dead-time FSM (MA-Q2) |
| **M4-2** | ~~Motor burst modes~~ → **delivered in M1d**; M4 retains polish only if M1d scope splits |
| **M4-3** | Hall effect + magnet → rotation **`endSessionMode`** (MA-D20 v2) |
| **M4-4** | Hardware strap cross-check (MA-D13) |
| **M4-5** | Duty % calibration scale (MA-D19) |
| **M4-6** | Thermal input / software stall limits (MA-D16 hardware path) |

### Phase M4 sign-off (optional)

| Field | Value |
|-------|--------|
| **Date** | |
| **Items completed** | |
| **Signed by** | |

---

## 9. Progress summary

Update this table when a phase is signed off.

| Phase | Status | Sign-off date |
|-------|--------|----------------|
| M0 | In progress (M0-F2/M0-F5 open; **M0-V1/V2** done) | |
| M1 | **Signed off** (Run B) | 2026-10-27 |
| M1b | **Done** (modes + ramp + manual; bursts **M4**) | 2026-10-27 |
| M1c | **Done** (pattern graph + segment telemetry) | 2026-10-27 |
| M1d | **Not started** — motor bursts + placement ([31 §5.2.1](./31-Motor-Actuator-Device-Design.md#521-bursts-in-motor-automatic-design-locked-2026-10-27)) | |
| M2 | **Unblocked** — begin standalone parity (M1 + X-6 done); may overlap M1d | |
| **X-6** | **Complete** (§2.3 S4) | 2026-10-27 |
| **X-4** | **Done** (Run A) | 2026-10-27 |
| M3 | Blocked on M2 | |
| M4 | Optional | |

---

## 10. Document history

| Date | Change |
|------|--------|
| 2026-10-25 | Initial plan + checklists from doc 31 |
| 2026-10-25 | Git: branch from `SomEsp` → `feature/motor-actuator` |
| 2026-10-26 | Checklist: M0/M1 items marked per `feature/motor-actuator` implementation state |
| 2026-10-26 | M1: motor periodic FSM, API validation, motor automatic UI, PROTOCOL `resultJson` |
| 2026-10-26 | M1-U3/T2 E2E: Slv67 motor periodic → history `sess-173` (2 segments / 50 s) |
| 2026-10-26 | M1-F7 / M1b ramp deferred until motor module on bench for visual tuning |
| 2026-10-26 | Bench motor ESP: 5 kHz PWM; M1-F7 segment ramp + UI `rampMs` field |
| 2026-10-26 | X-6 / MA-D21 — document multi-device-per-Sub remit gap; interim dual-Sub bench |
| 2026-10-26 | Production motor E2E on Slv66: ramp segments, cooperative stop, 30 min end-session clock, abort |
| 2026-10-26 | Motor UI: `motorAutomatic` in pairing settings; TabSync mode guard — persistence verified on bench |
| 2026-10-26 | **X-6i / M1-U4** — per-Sub session + running scoping for dual-Sub bench; operator verified switch without cross-contamination |
| 2026-10-26 | **[33](./33-Multi-Device-Per-Sub-Spike.md)** — X-6 spike (UC-4 dual-motor, slices X-6.1–X-6.6); gates M1b/M2/M3 |
| 2026-10-26 | Spike decisions: relay-only session accessory (MA-D22); independent motors; no v1 relay+motor lockout; gateway super-session future |
| 2026-10-26 | Spike **§8 sign-off** — Q2 always `deviceId`; Q5 max 8 (MA-D13); Q6 one relay/Sub; Q7 migration; begin X-6.1 |
| 2026-10-26 | [33 §1.1](./33-Multi-Device-Per-Sub-Spike.md) vision — gateway orchestration; per-device UI; Q8 no session block without accessory (MA-D24) |
| 2026-10-26 | **X-6.1–X-6.2** — composite PK `(Dom, Sub, DeviceId)`; list/pair/revoke per device; hub unicast; UI `deviceId` + device picker |
| 2026-10-27 | **[34](./34-Operator-Session-And-Accessory-V2-Rules.md)** — V2 operator norm (Scene + voluntary Accessory; motion decoupled); do not bleed P16/V1 into X-6 changes |
| 2026-10-27 | **§2.4** operator runs (Run A X-4, Run B M1) — executable sign-off; revert premature doc-only sign-off |
| 2026-10-27 | Operator: Run A **R0–R11** + Run B **M1-B1–B8** all pass — **X-4** + **M1** sign-off recorded |
| 2026-10-27 | **X-6.3** — `DomSubDeviceSettings`; settings API requires `deviceId`; UI reload/save per device picker |
| 2026-10-27 | **X-6.6** — tab-sync `running` keyed by `(subTarget, deviceId, kind)`; legacy running without `deviceId` ignored |
| 2026-10-27 | **X-6.4** — history/timeline optional `deviceId` filter; UI device badges + multi-device scope; fix `DeviceId` on timeline enrich |
| 2026-10-27 | **M1b** — motor automatic modes + `automatic-update` + manual `motor-run`; bursts deferred **M4** |
| 2026-10-27 | **M1c** — segment hub telemetry + operator pattern graph (Feeds \| Graph) |
| 2026-10-27 | **M1d** — motor burst + placement design ([31 §5.2.1](./31-Motor-Actuator-Device-Design.md#521-bursts-in-motor-automatic-design-locked-2026-10-27)); checklist BP-E; bursts moved from M4/M1b-F4 |
