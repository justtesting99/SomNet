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
| **X-7** | Motor automatic **burst + placement** design ([31 §5.2.1](./31-Motor-Actuator-Device-Design.md#521-bursts-in-motor-automatic-design-locked-2026-10-27), [36 BP-E](./36-Burst-Placement-Modes-Design.md#8-motor-bp-e--phase-m1d)) | Docs + hub path | **Done** — **M1d** signed **2026-10-28** (`0.16.4-motor-burst-duty`) |

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

**Not part of M1 sign-off:** M1b random modes (covered under M1b sign-off), M2 standalone.

#### Run C — **M1d** motor bursts + pattern graph (after Run B)

**Unit under test:** motor-profile ESP + rebuilt **`SomNet.UI/dist`**. **Exit (M1d):** burst clusters on device; live/recorded graph aligned with segment acks; relay graph uses same recording lifecycle.

| ☐ | Step | What to do | Pass |
|---|------|------------|------|
| ☑ | **M1d-C1** | Flash **`0.16.4-motor-burst-duty`** (`pio run -e dev -t upload`) | Boot banner matches tag |
| ☑ | **M1d-C2** | Segmented automatic + **`burstsOn`** (e.g. Random Speed, main+ or session spread, 1 min) | Bench motion + serial burst micro lines |
| ☑ | **M1d-C3** | **Graph** tab while running | Live curve shows main segments **and** burst clusters (100% axis = mapped speed from duty) |
| ☑ | **M1d-C4** | **Stop** or natural end — **do not** change settings | Graph keeps **recorded** run until settings change or **Start** again |
| ☑ | **M1d-C5** | Change a graph-affecting setting (e.g. burst max or segment timing) | Recorded graph clears; preview from new settings |
| ☑ | **M1d-C6** | Relay on same Sub: automatic run + graph | Same keep/clear rules as motor (`relayAutomaticGraphFingerprint`) |
| ☑ | **M1d-C7** | History row after burst session | Summary mentions burst events when `burstEventsCompleted` > 0 |

When **M1d-C1–C7** pass → fill **§5.2 Phase M1d sign-off** and update §9 **M1d** row.

---

## 3. Phase M0 — Motor backend & discovery

**Exit (from doc 31):** Manual PWM/stop from **`/operate`** or hub manual path; Serial shows D25/D27 activity; D26/D14 idle; caps report `actuatorKind: hbridge` when provisioned.

### 3.1 Firmware (`SomNet.Device`)

- [x] **M0-F1** NVS key `actuator_kind` (`relay` \| `hbridge`); read at boot; default `relay` for existing units. *(NVS key `act_kind`; config POST `actuator_kind`.)*
- [x] **M0-F2** Boot: select **one** backend + gated init (relay **or** motor per NVS) — MA-R7. *(Both drivers `begin()`/`poll()`; **commands + FSM** gated by NVS — verified Run A/B/C, **2026-10-28**.)*
- [x] **M0-F3** `MotorController` / `MotorBackend`: LEDC PWM on `PIN_MOTOR_PWM`; enable outputs `PIN_MOTOR_ENABLE` (+ secondary pins held inactive v1).
- [x] **M0-F4** **MA-D15:** disarmed / aborted / idle → PWM 0, enables **inactive** (`MOTOR_ENABLE_ACTIVE_HIGH`).
- [x] **M0-F5** Manual commands (hub and/or `/operate`): motor run/stop at duty % — route only when NVS = `hbridge`. *(Hub **`motor-run` / `motor-stop`** + **`MotorManualControls`** — Run B **M1-B3** + M1d bench; ESP **`/operate`** still relay-only → **M2**.)*
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
| **Date** | 2026-10-28 |
| **Signed by** | Operator (bench) |
| **Firmware version / git** | **`0.16.4-motor-burst-duty`**; `@2fd5da1` (same unified `env:dev` as X-4 / M1) |
| **Hardware** | ☑ Module on bench ☐ Serial-only |
| **Notes** | **M0-V1/V2** (2026-10-27 Run A/B). **F2/F5** closed on hub path: relay vs motor isolation (Run A **R7**, Run B **M1-B7**), manual PWM + stop/abort (Run B **M1-B3/B4**, M1d runs). Full single-backend `begin()` polish optional; not blocking hub MVP. **`/operate` motor manual** remains **M2**. |
| **All M0 items complete** | ☑ |

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

**Prerequisite:** **M1b** signed off (segmented modes + `automatic-update`). Relay burst placement shipped — [36](./36-Burst-Placement-Modes-Design.md), firmware lineage **`0.15.2-burst-main-timing`** on unified binary (**current tag `0.16.4-motor-burst-duty`**).

**Design (locked 2026-10-27):** [31 §5.2.1 — Bursts in motor automatic](./31-Motor-Actuator-Device-Design.md#521-bursts-in-motor-automatic-design-locked-2026-10-27) (MA-D25–D27).

**Exit:** Motor device executes `burstsOn` with all **six** `burstPlacement` values (segmented modes); **periodic** supports **session spread + minutes** only; interim reject or full implementation; pattern graph preview includes bursts.

### 5.2.1 Design & product

- [x] **M1d-D1** Operator sign-off on §5.2.1 (main beat, periodic matrix, burst cluster shape) — **2026-10-28** (Run C)
- [x] **M1d-D2** PROTOCOL / `boardDefs` note for burst micro-hold ms once bench value chosen (MA-D26) — **300 ms** in `motor_automatic_burst.h`; pointer in `boardDefs.h`

### 5.2.2 Firmware (`MotorAutomaticSessionMode`)

- [x] **M1d-F1** Parse `burstsOn`, `burstPlacement`, burst percent/style/ranges in `parseMotorAutomaticConfig`
- [x] **M1d-F2** ~~Until burst FSM complete: reject `burstsOn`~~ — **N/A**; shipped with FSM + **MA-D27** validation (`motorBurstSettingsAllowed`) instead of blanket reject
- [x] **M1d-F3** Motor config adapter → shared `buildAutomaticBurstPlan` / replan (`automatic_burst_runtime`)
- [x] **M1d-F4** Burst sub-FSM: micro-cycles (ramp → hold → intra-gap) using `MotorController` ramps (MA-D14)
- [x] **M1d-F5** **Main+** triggers after segment complete; **instead-of** before next `beginSegmentTransition`
- [x] **M1d-F6** Wall-clock **session spread** in `poll` between segment work
- [x] **M1d-F7** **Chance** rolls at same hook points as relay (`esp_random`)
- [x] **M1d-F8** `automatic-update` rebuilds burst plan (Phase 11 parity)
- [x] **M1d-F9** `resultJson`: `burstEventsCompleted`, `burstPlacement` echo
- [x] **M1d-F10** `emitSegmentRamp` during burst clusters (live graph parity) — incl. **`burstMicroTransitionRampMs`** → Options **`segmentTargetRampMs`**

### 5.2.3 Shared / API

- [x] **M1d-S1** `MotorAutomaticControlStateDto` / pairing serializer — verify burst fields (likely already ☑)
- [x] **M1d-S2** Motor automatic history / summary strings mention burst events when present — `AutomaticSessionSummaryBuilder` + UI `sessionSummary` / `automaticResultJson`

### 5.2.4 UI

- [x] **M1d-U1** `motorSpeedSchedule.ts` — burst preview using shared placement helpers (`buildRelayBurstPlan`, `appendMotorBurstCluster`; Options ramp via `segmentTargetRampMs`)
- [x] **M1d-U2** `MotorAutomaticControls`: disable even/chance placements when mode = periodic (MA-D27)
- [x] **M1d-U3** Remove “settings only / not on device” banner when **M1d-F4** ships

### 5.2.5 Tests & bench

- [x] **M1d-T1** API validator tests for motor + `burstsOn` — `HardwareCommandPayloadValidatorBurstPlacementTests` (motor accept/reject)
- [x] **M1d-T2** TS unit tests for motor burst preview schedule — `motorSpeedSchedule.test.ts` (**burst preview M1d-T2**)
- [x] **M1d-V1** Bench segmented mode: main+ / instead-of smoke — operator **2026-10-28** (Run C)
- [x] **M1d-V2** Bench periodic + session spread + minutes — covered in Run C graph validation
- [x] **M1d-V3** Chance / random mode smoke — operator graph + bench **2026-10-28**

### Phase M1d sign-off

| Field | Value |
|-------|--------|
| **Date** | 2026-10-28 |
| **Signed by** | Operator (bench + graph) |
| **Firmware version** | **`0.16.4-motor-burst-duty`** (unified `env:dev`; relay burst placement lineage **`0.15.2-burst-main-timing`**) |
| **Git / UI** | `@2fd5da1`; **`SomNet.UI/dist`** rebuilt after graph recording parity |
| **Test deviceId** | Motor on **`Slv66`** (same-Sub relay regression path) |
| **Notes** | **MA-D28** burst relative → duty min/max; graph dedupe by `programElapsedMs`; motor + relay **record** last run until fingerprint mismatch or Start; segment #0 resets dedupe only. |
| **All M1d items complete** | ☑ |

---

## 6. Phase M2 — SomEsp standalone (local API + `/operate`)

**Prerequisite:** **M0–M1d hub sign-off** complete; [X-6](./33-Multi-Device-Per-Sub-Spike.md) done. **Not required:** SomNet.API / SomNet.UI (M2 is device-only + optional .NET local job host per [28](./28-Scheduled-Jobs-Local-Device-Integration.md)).

**Exit (MA-R5 step 2):** Motor unit with NVS **`actuatorKind: hbridge`** runs **the same programs** as hub M1–M1d via **`POST /api/local/commands`** and **`/operate`** — no SignalR. Relay SomEsp behavior **unchanged**. Optional: scheduled jobs pass motor JSON documented in PROTOCOL §6.

**Parity principle (M2-P0):** Treat **`POST /api/local/commands`** + **`GET/PUT /api/local/settings`** + **`GET /api/local/caps`** + session **`resultJson`** as the **LAN-facing mirror** of SomNet hub dispatch ([PROTOCOL §6](../SomNet.Device/docs/PROTOCOL.md), [Shared DTOs](../SomNet.Shared/DTO/)). Same **`commandKey`**, same **`payloadJson`** shapes (after hub-side normalization), same validation outcomes. **`/operate`** is a thin browser client over that API — not a second protocol. Where cloud-only concepts exist (Dom/Sub, SignalR, scene session, pattern graph, multi-`deviceId`), document an **explicit exception** in §6.1.1 — do not silently diverge field names or relay-shaped motor payloads.

**Primary references:** [27 — SomEsp plan](./27-SomEsp-Standalone-Device-Plan.md) · [SomNet.Device/docs/SOMESP-STANDALONE.md](../SomNet.Device/docs/SOMESP-STANDALONE.md) · [31 §6.1 LAN bind](./31-Motor-Actuator-Device-Design.md#61-esp-firmware) (MA-D12) · [28 — Scheduled jobs](./28-Scheduled-Jobs-Local-Device-Integration.md) (job host uses same JSON as hub)

### 6.0.1 Hub vs local — parity matrix (target)

| Surface | Hub (SomNet.API) | Local (`env:somesp`) | M2 target |
|---------|------------------|----------------------|-----------|
| **Registration / kind** | `POST /api/devices/pair` + `actuatorKind` | **`/config` POST `actuator_kind`** (+ optional unlock bind **M2-B2**) | Same enum `relay` \| `hbridge`; mismatch rules = PairDevice |
| **Caps** | Device status / pairing caps | **`GET /api/local/caps`** | Same fields as PROTOCOL caps (relay stroke limits vs motor duty limits) |
| **Manual motion** | `motor-run` / `motor-stop` or `stroke` / `burst` | **`POST /api/local/commands`** same keys + payload | ☑ engine; **M2-C** UI |
| **Automatic** | `automatic-start` / `stop` / `update` / `abort` | Same **`commandKey`** + **`payloadJson`** | Motor: **hub `buildMotorAutomaticStartPayload` shape** (incl. `actuatorKind`, `segmentTargetRampMs`, burst fields) — not relay stroke-ms JSON |
| **Settings persistence** | `GET/PUT /api/settings` per Dom+Sub+`deviceId` (`PairingSettingsDto`) | **`GET/PUT /api/local/settings`** | **M2-D:** store **`motorManual` + `motorAutomatic`** (+ relay `manual`/`automatic` when `relay`); optional **`appOptions`** slice for motor segment ramp (mirrors UI Options → payload) |
| **Session shell** | Scene row, accessory, TabSync | Unlock + **arm** + Bearer (SE-D5) | Different **shell** (MA-R6) — acceptable; motion payloads still match |
| **Completion** | Hub `CommandAcknowledged` + API history | **`GET /api/local/status`** poll + **`resultJson`**; LittleFS history | Same **`resultJson`** schema per actuator (motor branch in Shared summary builders) |
| **Live telemetry** | `motor-automatic-segment` hub acks → UI graph | Local ack logged + status/history | **No `/operate` graph**; optional future **`GET /api/local/status` segment field** — not required for M2 sign-off |
| **Validation** | `HardwareCommandPayloadValidator` | Firmware `parseMotorAutomaticConfig` / relay parsers | Same reject reasons for cross-kind and burst placement (MA-D27) |

**Job host ([28](./28-Scheduled-Jobs-Local-Device-Integration.md)):** Build **`payloadJson`** with the **same JSON** the hub would send (copy from Shared DTO serialization or UI `buildMotorAutomaticStartPayload` rules); only transport differs (`/api/local/commands` vs SignalR).

### 6.0 Scope map (work packages)

| Slice | Goal | Gate |
|-------|------|------|
| **M2-A** | **As-built audit** — what already works on `env:somesp` + shared `CommandHandler` | Done in §6.1 below |
| **M2-B** | **Provisioning** — set / display `actuatorKind` on standalone path (MA-D12 LAN) | **M2-B sign-off** |
| **M2-C** | **`/operate` UI** — caps-driven relay **or** motor panels | **M2-C sign-off** |
| **M2-D** | **Local settings NVS** — **`PairingSettingsDto`-aligned** snapshots (motor + relay) + optional **`appOptions`** ramp slice | **M2-D sign-off** |
| **M2-E** | **Command parity** — curl runbook = hub behavior (modes, bursts, stop/abort) | **Run D** |
| **M2-F** | **Status / history / caps** — motor-aware `/api/local/status`, summaries | **Run D** |
| **M2-G** | **Docs + version** — SOMESP, PROTOCOL local, 27/28, `somesp-*` tag policy | **M2-D1** |

Implement **B → C → D** in parallel with **E** (curl can precede UI). **F** fixes discovered during **E**.

---

### 6.1 As-built inventory (2026-10-28 code audit)

Same **`MotorAutomaticSessionMode`** / **`CommandHandler`** as hub when NVS = `hbridge`. `env:somesp` **`extends env:dev`** + `SOMNET_STANDALONE=1` (motor burst code included; firmware string **`somesp-0.3.7-nvs-settings`** today vs hub **`0.16.4-motor-burst-duty`**).

| ID | Item | Status | Notes |
|----|------|--------|--------|
| **M2-A1** | `env:somesp` builds; motor + relay FSMs in one image | ☑ | `platformio.ini` |
| **M2-A2** | `GET /api/local/caps` → `actuatorKind` + motor duty limits | ☑ | `local_api.cpp` |
| **M2-A3** | `POST /api/local/commands` → `CommandHandler` (local correlation `local-*`) | ☑ | Accept + poll `/api/local/status` |
| **M2-A4** | **`motor-run` / `motor-stop`** when NVS = `hbridge` | ☑ | Not exposed on `/operate` |
| **M2-A5** | **`automatic-start` / `stop` / `update` / `abort`** → motor FSM when NVS = `hbridge` | ☑ | Payload = PROTOCOL motor JSON (not relay stroke-ms) |
| **M2-A6** | Motor segment + session complete acks on **local** path | ☑ | `command_handler.cpp` → `localCommandStatus` + history |
| **M2-A7** | **`/config` POST `actuator_kind`** (relay \| hbridge) | ☑ | `config_web_server.cpp` — hub PairDevice equivalent for LAN |
| **M2-A8** | **`/operate`** relay manual + relay automatic UI | ☑ | Phases 2–5 SomEsp — **relay-shaped JSON only** |
| **M2-A9** | **`POST /api/local/unlock`** carries **`actuatorKind`** | ☐ | Unlock is PIN-only today; kind via **`/config`** only |
| **M2-A10** | **`/operate`** motor manual / motor automatic UI | ☑ | **M2-C** operator pass **2026-10-28** (LAN `/operate`, `hbridge`) |
| **M2-A11** | **`/api/local/settings`** motor snapshot shape | ☑ | **`motorManual` + `motorAutomatic` + `appOptions`**; **`/operate`** read/write via PUT (**M2-C/D6**) |
| **M2-A12** | **`GET /api/local/status`** `automaticActive` for **motor** session | ☑ | **`CommandHandler::isMotionBusy` / `isAutomaticProgramActive`** (M2-F1) |
| **M2-A13** | Local history summaries readable for motor `resultJson` | ☑* | **LittleFS on `env:somesp` only**; **`env:dev`** → **`503 history_unavailable`** (Run D **M2-R6**, 2026-10-28) |
| **M2-A14** | **Pattern graph / segment UI on device** | **Out of M2** | Hub UI only ([03 § Motor pattern graph](./03-Frontend-Architecture.md#motor-pattern-graph-scope)); local status may expose segment JSON in status/history only |

#### 6.1.1 Accepted parity exceptions (cloud / product shell)

These are **intentionally different** on standalone; everything else should match hub wire behavior.

| Exception | Hub | Standalone | Notes |
|-----------|-----|------------|--------|
| Transport | SignalR **`ExecuteCommand`** + REST dispatch | **`POST /api/local/commands`** + poll **`/api/local/status`** | Same `commandKey` + `payloadJson` |
| Auth | Device token + Dom JWT | PIN → Bearer + **arm** | SE-D5 |
| Registration | **`PairDevice`** | **`/config` `actuator_kind`** (+ optional **M2-B2** unlock) | Same NVS key |
| Scene / accessory / TabSync | SomNet.UI session row | None | Motion not blocked by accessory off (V2 on hub); standalone uses arm only |
| Multi-`deviceId` / Sub routing | API paths + hub unicast | Single device per ESP | N/A on SomEsp |
| Pattern graph | SignalR segment acks → UI | Not in scope | Segment acks may still appear in serial / future status field |
| **`running` flag in settings** | Server + TabSync | Omit or local-only | Do not send stale `running: true` in **`automatic-start`** payload |
| Notifications / history cloud | SomNet.API **`/api/history`** | LittleFS **`/api/local/history`** | Same **`resultJson`** content where possible |

---

### 6.2 Slice M2-B — Provisioning & caps (MA-D12 LAN)

- [x] **M2-B1** Document installer flow: **`/config` / `/operate` / unlock** → **`hbridge`** before motor bench — [SOMESP-STANDALONE.md](../SomNet.Device/docs/SOMESP-STANDALONE.md) **Actuator profile**.
- [x] **M2-B2** *(Optional)* **`POST /api/local/unlock`** accept optional **`actuatorKind`** when NVS unbound (mirror PairDevice); reject mismatch when bound.
- [x] **M2-B3** Status page (`/`) show bound **`actuatorKind`** (read-only) — all builds with local API.
- [x] **M2-B4** **`SOMESP-STANDALONE.md`** caps table: motor row (`minDutyPercent` / `maxDutyPercent`).

**Pass:** Flash `somesp` → set **`hbridge`** via config → `GET /api/local/caps` returns motor caps; relay unit unchanged.

---

### 6.3 Slice M2-C — `/operate` UI (client of local API)

**Rule:** Every control action maps to **`POST /api/local/commands`** with the **same `payloadJson` the hub would send** (see [UI `buildMotorAutomaticStartPayload`](../SomNet.UI/src/utils/motorAutomaticStartPayload.ts) rules). No relay **`minimumStrokeMs`** on motor profile.

- [x] **M2-C1** On load (after unlock): **`GET /api/local/caps`** → branch UI (relay vs motor).
- [x] **M2-C2** **Motor manual:** duty slider + **`motor-run`** / **`motor-stop`** — payload `{ dutyPercent }` per PROTOCOL §6.9.
- [x] **M2-C3** **Motor automatic:** hub modes + fields (**M1b/M1d**); start/update JSON incl. `actuatorKind`, `segmentTargetRampMs`, burst fields.
- [x] **M2-C4** **Motor bursts:** MA-D27 / MA-D28 field rules + placement coercion for **periodic** (ported from UI rules).
- [x] **M2-C5** **Relay profile:** keep current `/operate` (regression **M2-E8**).
- [x] **M2-C6** Live **`automatic-update`** debounce (~400 ms); payload = full snapshot like hub **`automatic-update`**.

**Pass:** Operator can run a 1 min **Set Speed** + bursts session from phone browser without curl. **Operator verified manual + automatic on `/operate` — 2026-10-28.**

#### M2-C sign-off (slice)

| Field | Value |
|-------|--------|
| **Date** | 2026-10-28 |
| **Signed by** | Operator (chat) |
| **Build** | `env:dev` + `SOMNET_LOCAL_API` (hub firmware with LAN `/operate`) |
| **Notes** | Motor **manual** (`motor-run`/`motor-stop`) and **automatic** from Control panel confirmed working. Relay regression (**M2-E8**) not re-run this session. |

---

### 6.4 Slice M2-D — Local settings NVS (**API parity**)

Goal: **`GET/PUT /api/local/settings`** returns the same **logical fields** the hub persists in **`PairingSettingsDto`** for the bound **`actuatorKind`** (camelCase JSON on the wire, matching firmware command payloads).

- [x] **M2-D1** **Relay profile:** keep `manual` + `automatic` (`AutomaticControlStateDto` shape) — no regression.
- [x] **M2-D2** **Motor profile:** add **`motorManual`** + **`motorAutomatic`** objects aligned with [Shared](../SomNet.Shared/DTO/Settings/PairingSettingsDto.cs) / UI types (`MotorManualControlStateDto`, `MotorAutomaticControlStateDto` field names in JSON).
- [x] **M2-D3** Optional top-level **`appOptions`**: `{ "motorSegmentTargetRampMode", "motorSegmentTargetRampMs" }` so `/operate` and job hosts can build **`automatic-start`** identical to [hub `buildMotorAutomaticStartPayload`](../SomNet.UI/src/utils/motorAutomaticStartPayload.ts) (`segmentTargetRampMs` in start payload).
- [x] **M2-D4** Validation: reject motor-shaped keys when caps = relay and vice versa (or ignore foreign keys with clear error).
- [x] **M2-D5** Confirm **`kMaxLocalOperateSettingsBytes` (1536)** fits motor automatic + bursts + `appOptions` (same budget as **`kMaxHardwareCommandPayloadJson`**). **Operator PASS — 2026-10-28 (Run D).**
- [x] **M2-D6** **`/operate`**: read/write settings through API only (localStorage = cache optional); PUT debounce like hub settings save. **Operator PASS — 2026-10-28 (Run D).**

**Pass:** Serialize a hub motor start payload from stored settings + `appOptions`; byte-identical to a known-good hub example for the same operator inputs.

---

### 6.5 Slice M2-E — Command parity (curl runbook — **M2-V1**)

Use **`pio run -e somesp`**, motor on bench, NVS **`hbridge`**. Bearer from unlock; **arm** before commands.

| ☐ | Step | Command / action | Pass |
|---|------|------------------|------|
| ☑ | **M2-E1** | Unlock → arm → **`motor-run`** `{ dutyPercent, durationMs }` | **PASS — 2026-10-28** (Run D **M2-R2** / `/operate`) |
| ☑ | **M2-E2** | **`motor-stop`** | **PASS — 2026-10-28** (Run D **M2-R2** / `/operate`) |
| ☑ | **M2-E3** | **`automatic-start`** — motor JSON **matches hub** (include `actuatorKind`, `segmentTargetRampMs`, bursts) | **PASS — 2026-10-28** (Run D **M2-R3** / `/operate`) |
| ☑ | **M2-E4** | **`automatic-stop`** cooperative | **PASS — 2026-10-28** (Run D **M2-R3** / `/operate`) |
| ☑ | **M2-E5** | **`abort`** during automatic | **PASS — 2026-10-28** (Run D **M2-R3** / `/operate`) |
| ☑ | **M2-E6** | **`automatic-update`** mid-session | **PASS — 2026-10-28** (**M2-C6** live debounce / `/operate`) |
| ☑ | **M2-E7** | **`automatic-start`** + **`burstsOn`** + **`mainPlusAfterMainStroke`** (segmented mode) | **M2-R4 PASS — 2026-10-28** |
| ☑ | **M2-E8** | Relay NVS **`relay`**: **`stroke`** + relay **`automatic-start`** | **M2-R1 PASS — 2026-10-28** |
| ☑ | **M2-E9** | Cross-kind negative: **`stroke`** on motor NVS | **PASS — 2026-10-28** (operator; same local **`CommandHandler`** reject path) |

Publish copy-paste recipes in **`SomNet.Device/docs/SOMESP-STANDALONE.md`** — **M2-E runbook** ☑ (2026-10-28). **Slice M2-E (E1–E9): operator signed — 2026-10-28** (bench via **`/operate`** + Run D; curl recipes retained for regression). [28 §3.3](./28-Scheduled-Jobs-Local-Device-Integration.md#33-automatic-start-payload) — motor **`PairingSettingsDto`** / start payload rules ☑ (2026-10-28).

---

### 6.6 Slice M2-F — Status, history, shell

- [x] **M2-F1** **`GET /api/local/status`:** `automaticActive` + `busy` true when **motor** automatic or motor manual timed run active — **`actuatorKind`** echo on status.
- [x] **M2-F3** Local **history** entries for motor sessions (mode label / summary string for `/operate` History tab) — **`buildSummary`** motor branch (`env:somesp` LittleFS).
- [x] **M2-F2** **`resultJson`** on status matches motor schema (segments, burst counts) — parity with hub. **Spot-check PASS — M2-R6 / Run D 2026-10-28.**
- [x] **M2-F4** PIN, arm/disarm, lock, Wi‑Fi loss policy — unchanged SE-D5/D6. *(Verified with M2-C.)*

---

### 6.7 Slice M2-G — Build tag & documentation

- [x] **M2-G1** **`env:somesp` `FIRMWARE_VERSION`** — **`somesp-0.16.4-motor-burst-duty`** aligned with hub tag.
- [x] **M2-G2** [27 — SomEsp](./27-SomEsp-Standalone-Device-Plan.md) — **§ Motor profile (M2)** refresh — **signed 2026-10-28**.
- [x] **M2-G3** [PROTOCOL.md](../SomNet.Device/docs/PROTOCOL.md) — **§6.11 Local LAN API** (**M2-P0**).
- [x] **M2-G4** [32 §9](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md#9-progress-summary) + root README when M2 signed — **2026-10-28**.

---

### 6.8 Legacy checklist rows (rollup)

| ID | Rolled into |
|----|-------------|
| **M2-F1** | **M2-A1**, **M2-G1** |
| **M2-F2** | **M2-B2** (optional), **M2-B1** |
| **M2-F3** | **M2-E**, **M2-C**, **M2-A5** |
| **M2-F4** | **M2-F4** (slice F) |
| **M2-D1** | **M2-G2**, **M2-G3** |
| **M2-V1** | **M2-E** + **Run D** |

---

### 6.9 Run D — **M2** operator / bench sign-off

After **M2-B–G** complete (minimum: **B + E + F1** and either **C** or curl-only trial).

| ☐ | Step | Pass |
|---|------|------|
| ☑ | **M2-R1** | Relay SomEsp smoke (**M2-E8**) on `actuatorKind: relay` — **PASS 2026-10-28** |
| ☑ | **M2-R2** | Motor manual (**M2-E1–E2**) — **2026-10-28** `/operate` |
| ☑ | **M2-R3** | Motor automatic periodic + stop/abort (**M2-E3–E5**) — **2026-10-28** `/operate` |
| ☑ | **M2-R4** | Motor bursts smoke (**M2-E7**) — **PASS 2026-10-28** |
| ☑ | **M2-R5** | **`/operate` motor UI** (**M2-C**) — **2026-10-28** |
| ☑ | **M2-R6** | Status/history for motor (**M2-F1–F3**) — **status/`resultJson` PASS**; **`GET /api/local/history`** → **`history_unavailable`** on **`env:dev`** (expected — LittleFS on **`env:somesp` only**; see SOMESP-STANDALONE) |

→ Fill **Phase M2 sign-off** below and §9.

### Phase M2 sign-off

| Field | Value |
|-------|--------|
| **Date** | **2026-10-28** — **Phase M2 closed** |
| **Signed by** | Operator |
| **Firmware version** | Hub **`0.16.4-motor-burst-duty`** + **`SOMNET_LOCAL_API`** on **`env:dev`**; SomEsp **`somesp-0.16.4-motor-burst-duty`** |
| **Hardware** | ☑ Motor module ☑ Relay module |
| **Notes** | LAN **`/operate`** + **`/api/local/*`** parity with hub payloads (**M2-P0**). LittleFS **`/api/local/history`** on **`env:somesp`** only (**503** on **`dev`**). Pattern graph hub-only. |
| **All M2 slices complete** | ☑ |

---

## 7. Phase M3 — Gateway & TheSystem

**Prerequisite:** **M2 sign-off** complete.

**Exit:** `automatic/run` on motor `deviceId`; TheSystem registration + motor preset; relay + motor **parallel** jobs (P7-D2); runbook updated.

### 7.0 M3 implementation status (2026-10-28)

| Slice | Status | Notes |
|-------|--------|--------|
| **Shared + LocalClient + Gateway** | **In progress** | `MotorAutomaticStartPayloadBuilder`, `AutomaticRunRequestDto` motor fields, caps probe, **M3-G2** validation |
| **TheSystem admin VO** | **In progress** | `SomNetAutomaticRunRequestVO.actuatorKind` + `motorParameters` |
| **TheSystem EF registry (T1–T2)** | Open | [SOMNET_DEVICE_REGISTRY.md](../../TheSystem/Docs/SOMNET_DEVICE_REGISTRY.md) still planned |
| **Runbook / doc 30 (D1, S1)** | Partial | Motor gateway payload section — extend as M3 closes |

**Bench next:** Configure gateway `Device:Devices[]` with motor ESP (`actuatorKind` optional hint) → `POST /api/v1/devices/{id}/automatic/run` with **`motorParameters`** → parallel relay job on second `deviceId` (**M3-V1**).

### 7.1 Gateway (`TheSystem` repo)

- [ ] **M3-G1** Motor row in `Device:Devices[]`; pass-through motor JSON on `RunAutomaticAsync`. *(Code: `motorParameters` + `MotorAutomaticStartPayloadBuilder` — verify on hardware.)*
- [ ] **M3-G2** Reject relay preset body to motor `deviceId` (optional caps probe). *( **`AutomaticRunRequestValidator`** + caps — unit/gateway tests.)*
- [ ] **M3-G3** Optional `GET /api/v1/devices` includes `actuatorKind` from caps cache. *( **`DeviceGatewayCapsService`** — verify list returns `hbridge`.)*

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
| M0 | **Signed off** (hub path; F2/F5 via Run A/B/C) | 2026-10-28 |
| M1 | **Signed off** (Run B) | 2026-10-27 |
| M1b | **Done** (modes + ramp + manual; bursts → **M1d**) | 2026-10-27 |
| M1c | **Done** (pattern graph + segment telemetry) | 2026-10-27 |
| M1d | **Signed off** (Run C) — **`0.16.4-motor-burst-duty`**; graph + relay recording parity | 2026-10-28 |
| M2 | **Signed off** — SomEsp / LAN local API + **`/operate`** motor + relay (**Run D**, **`somesp-0.16.4-motor-burst-duty`**) | 2026-10-28 |
| **X-6** | **Complete** (§2.3 S4) | 2026-10-27 |
| **X-4** | **Done** (Run A) | 2026-10-27 |
| M3 | **In progress** — gateway motor `automatic/run` + caps (G1–G3 code landed); TheSystem registry/UI open | |
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
| 2026-10-27 | **M1d firmware** — `MotorAutomaticSessionMode` burst FSM + adapter; **`0.16.0-motor-burst`**; UI periodic placement gating (U2/U3) |
| 2026-10-28 | **M0 sign-off** — **F2/F5** operator pass on hub bench (Run A/B/C); **`/operate` motor** tracked in **M2** |
| 2026-10-28 | **M2 scoped checklist** — §6 work packages B–G, as-built audit **M2-A**, Run **D** (M2-R1–R6) |
| 2026-10-28 | **M2 implementation start** — **M2-F1** motor busy/automatic on `/api/local/status`; **M2-D** settings PUT validation (`motorManual`, `motorAutomatic`, `appOptions`); SOMESP-STANDALONE motor docs |
| 2026-10-28 | **M1d sign-off** — Run C **M1d-C1–C7**; **`0.16.4-motor-burst-duty`** (MA-D28 duty bursts, burst ramp, live graph F10); motor + relay pattern graph recording lifecycle; **`motorSpeedSchedule.test.ts` burst preview (M1d-T2)**; canonical doc sweep |
| 2026-10-28 | **M2-C sign-off** — operator **`/operate`** motor manual + automatic (LAN); Run D **M2-R2**, **M2-R3**, **M2-R5** checked |
| 2026-10-28 | **M2-B/E/G/F3** — actuator profile docs; **M2-E curl runbook**; PROTOCOL **§6.11**; **`somesp-0.16.4-motor-burst-duty`**; unlock **`actuatorKind`**; motor history summaries |
| 2026-10-28 | **Run D** — **M2-R1**, **M2-R4**, **M2-D5/D6** PASS; **M2-R6** status/`resultJson` PASS; **`history_unavailable`** on **`env:dev`** recorded as expected |
| 2026-10-28 | **M2-E1–E6**, **M2-E9** operator sign-off (parity with Run D / **`/operate`**; **E7–E8** via **M2-R4/R1**) |
| 2026-10-28 | **Phase M2 signed off** — **M2-G2/G4**, doc **28 §3.3** motor payload; **M3** unblocked |
