# Motor (H-bridge) actuator — implementation plan & phase checklists

**Status:** **In progress** on `feature/motor-actuator` — derived from [31 — Motor actuator design](./31-Motor-Actuator-Device-Design.md). Check boxes per phase; **do not start the next phase until the prior sign-off block is complete**.

**Git (SomNet repo):** Feature work branches from **`SomEsp`** — e.g. **`feature/motor-actuator`** (merge back to `SomEsp` / `main` per your release flow when phases complete).

| Related | Link |
|---------|------|
| **Design (decisions, MA-D*, payloads)** | [31 — Motor actuator design](./31-Motor-Actuator-Device-Design.md) |
| **Multi-device per Sub (spike)** | [33 — X-6 spike](./33-Multi-Device-Per-Sub-Spike.md) |
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
| **X-4** | Relay regression: relay NVS profile unchanged on same binary | Firmware CI / manual | In progress — §2.1 runbook |
| **X-5** | `boardDefs.h`: `MOTOR_PWM_FREQUENCY_HZ`, `MOTOR_ENABLE_ACTIVE_HIGH` tuned on module (MA-D18) | Firmware / bench | 5 kHz PWM validated; duty **>50%** very fast on production motor — operator using **~10%** until max-duty cap/tuning (MA-D18 follow-up) |
| **X-6** | **Multi-device per Sub** — [33](./33-Multi-Device-Per-Sub-Spike.md) **signed off** 2026-10-26; **X-6.1–X-6.2** in tree; **X-6.3–X-6.6** open. **Interim bench:** two Subs (X-6i) until same-Sub multi-pair verified | API + UI + docs | **In progress** — §2.3 S4 |
| **X-6i** | **Dual-Sub bench UI** — switching `selectedSub` must not leak session row, `running`, or Start/Stop state to the other Sub (until true multi-device-per-Sub). See §2.2 | SomNet.UI | **Done** (2026-10-26, operator verified) |

**Bench note (until X-6):** use **two Subs** (e.g. relay on `Slv66`, motor on `Slv67`) — not two boards on one Sub. You may **switch Sub in the UI** while the other device keeps its session; each Sub’s controls reflect **that** pairing only (X-6i).

### 2.2 Dual-Sub UI scoping (X-6i — interim until X-6)

Required for parallel motor + relay regression on one Dom account. **Does not** change hub routing (still one `deviceId` per Sub).

| ID | Behavior | Status |
|----|----------|--------|
| **X-6i-1** | `activeSession` in UI applies only when `session.subTarget` matches **selected Sub** | Done |
| **X-6i-2** | Tab-sync `running` includes **`subTarget`** + **`kind`** (`relay` \| `motor`); ignore foreign Sub | Done |
| **X-6i-3** | Session accessory “device automatic running” uses **paired actuator** for selected Sub (motor vs relay flag) | Done |
| **X-6i-4** | Automatic Start/Stop gated on **`settingsLoaded`** for selected Sub (no stale `running` flash on switch) | Done |
| **X-6i-5** | Operator: motor session on Sub A + switch to Sub B → B shows idle controls; switch back → A still in progress if device still running | **Verified 2026-10-26** |

**Code touchpoints (reference):** `SessionProvider` (`sessionForSub`), `TabSyncProvider` / `tabSync`, `SessionAccessoryProvider`, `MotorAutomaticControls` / `AutomaticControls`, `deviceAutomaticRunning.ts`.

### 2.3 Spike X-6 — multi-device per Sub (gate before M1b / M2 / M3)

**Treat as a spike, not a side task:** agree how **one Sub** hosts **many `deviceId`s** (two motors in one session, relay vs motor usually exclusive, future linear actuator) **before** expanding motor modes (M1b) or copying patterns to standalone/gateway (M2/M3).

| Step | Action | Status |
|------|--------|--------|
| **S1** | Read & review [33 — Multi-device per Sub spike](./33-Multi-Device-Per-Sub-Spike.md) (use cases UC-1–UC-5, §4 model, §5 slices) | ☑ |
| **S2** | Resolve **Q1–Q7** in [33 §7](./33-Multi-Device-Per-Sub-Spike.md) | ☑ 2026-10-26 |
| **S3** | **Spike sign-off** ([33 §8](./33-Multi-Device-Per-Sub-Spike.md)) | ☑ 2026-10-26 |
| **S4** | Implement **X-6.1** → **X-6.6** per agreed order | **In progress** — X-6.1 + X-6.2 (API/UI `deviceId`) landed 2026-10-26; X-6.3–X-6.6 remain |

**Phase gates (until S3 complete):**

| Phase | Rule |
|-------|------|
| **M1b** | **Blocked** — new motor modes/patterns should not assume single-device-per-Sub UI/settings |
| **M2** | **Blocked** — standalone API parity should follow **deviceId** routing from X-6.2 |
| **M3** | **Blocked on M2**; gateway already has P7-D2 — align session/history with spike §4.6 |
| **M1 / X-4** | **Allowed** — finish relay regression and M1 sign-off on dual-Sub bench (X-6i) |

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

Record deviceId, Sub, and date in **X-4** row when R1–R7 pass (R9 recommended when using two-Sub bench).

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

- [ ] **M0-V1** Flash **same** `env:dev` binary; set NVS to `hbridge` (config tool or temporary API); manual stop clears PWM + enable.
- [ ] **M0-V2** Relay-profile device on same binary: relay behavior unchanged (X-4).

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
- [x] **M1-F3** **Periodic** mode only for v1 sign-off (MA-D14 first ship).
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
- [x] **M1-U2** Hide relay-only controls when device/caps `actuatorKind` = `hbridge`. *(`AutomaticModeControls` switches UI; manual tab still relay — M2/M1 follow-up.)*
- [x] **M1-U3** Start / Stop / Abort E2E on paired motor device. *(Hub: `esp32-84CCA85C36B4` → Slv67; production bench `esp32-7C9EBD398F08` → Slv66, BTS7960, button accessory + periodic ramp + abort.)*
- [x] **M1-U4** Dual-Sub bench: switch Sub without cross-contaminating the other device’s session / automatic running UI (X-6i). *(Motor + relay Subs; sessions on each; operator verified 2026-10-26.)*

### 4.5 Tests

- [x] **M1-T1** Unit/integration tests for motor DTO validation (API or Shared).
- [x] **M1-T2** Manual test script or checklist run recorded (pair → arm → periodic → result). *(Slv67 + Slv66 production motor runs 2026-10-26.)*

### Phase M1 sign-off

| Field | Value |
|-------|--------|
| **Date** | |
| **Signed by** | |
| **Firmware / API / UI versions** | |
| **Test deviceId** | |
| **Notes** | |
| **All M1 items complete** | ☐ |

---

## 5. Phase M1b — Random mode + ramp (optional before M2)

**Planned after motor module on bench** (operator: defer until hardware can show duty/speed ramping — MA-D14).

**Prerequisite:** [X-6 spike sign-off](./33-Multi-Device-Per-Sub-Spike.md) (§2.3) — avoid baking single-device-per-Sub assumptions into new mode UI/settings.

**Exit:** Random power/timing (motor analog of relay) with **duty ramp** between targets — no instant duty jumps (MA-D14).

- [ ] **M1b-F1** Motor random mode(s) in FSM with ramp state machine.
- [ ] **M1b-F2** Caps / DTO: `rampMs` or slew defaults documented.
- [ ] **M1b-U1** UI mode selector entry for motor random (field rules like relay where applicable).
- [ ] **M1b-V1** E2E random session + `resultJson`.

### Phase M1b sign-off (optional)

| Field | Value |
|-------|--------|
| **Date** | |
| **Signed by** | |
| **Skipped for MVP?** | ☑ Yes — defer until motor on bench (then M1b or post-M2) |
| **All M1b items complete** | ☐ |

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
| **M4-2** | Motor burst modes with ramped duty steps |
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
| M0 | In progress (firmware + PROTOCOL; verification pending) | |
| M1 | Ready for sign-off (M1-R5 rebind; M1-F7 ramp; M1-U4 dual-Sub UI; **X-4** relay runbook pending) | |
| M1b | **Blocked on X-6 impl (§2.3 S4)** until host patterns land; ramp in M1-F7 | |
| M2 | Blocked on M1 + **X-6 impl** | |
| **X-6** | Spike signed off; **X-6.1–X-6.6** implementation | |
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
