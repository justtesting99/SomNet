# Motor (H-bridge) actuator — implementation plan & phase checklists

**Status:** **Ready to execute** — derived from [31 — Motor actuator design](./31-Motor-Actuator-Device-Design.md). Check boxes per phase; **do not start the next phase until the prior sign-off block is complete**.

**Git (SomNet repo):** Feature work branches from **`SomEsp`** — e.g. **`feature/motor-actuator`** (merge back to `SomEsp` / `main` per your release flow when phases complete).

| Related | Link |
|---------|------|
| **Design (decisions, MA-D*, payloads)** | [31 — Motor actuator design](./31-Motor-Actuator-Device-Design.md) |
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

| ID | Item | Owner / area |
|----|------|----------------|
| **X-1** | `ActuatorKind` enum in `SomNet.Shared` (`relay`, `hbridge`) | Shared |
| **X-2** | Motor program DTO sketch (`minimumDutyPercent`, `maximumDutyPercent`, `rampMs`, `endSessionMode` minutes/noAutoEnd — MA-D19, MA-D20) | Shared + PROTOCOL |
| **X-3** | Motor `resultJson` + summary builder (separate from relay) | Firmware + Shared + API |
| **X-4** | Relay regression: relay NVS profile unchanged on same binary | Firmware CI / manual |
| **X-5** | `boardDefs.h`: `MOTOR_PWM_FREQUENCY_HZ`, `MOTOR_ENABLE_ACTIVE_HIGH` tuned on module (MA-D18) | Firmware / bench |

---

## 3. Phase M0 — Motor backend & discovery

**Exit (from doc 31):** Manual PWM/stop from **`/operate`** or hub manual path; Serial shows D25/D27 activity; D26/D14 idle; caps report `actuatorKind: hbridge` when provisioned.

### 3.1 Firmware (`SomNet.Device`)

- [ ] **M0-F1** NVS key `actuator_kind` (`relay` \| `hbridge`); read at boot; default `relay` for existing units.
- [ ] **M0-F2** Boot: select **one** backend + gated init (relay **or** motor per NVS) — MA-R7.
- [ ] **M0-F3** `MotorController` / `MotorBackend`: LEDC PWM on `PIN_MOTOR_PWM`; enable outputs `PIN_MOTOR_ENABLE` (+ secondary pins held inactive v1).
- [ ] **M0-F4** **MA-D15:** disarmed / aborted / idle → PWM 0, enables **inactive** (`MOTOR_ENABLE_ACTIVE_HIGH`).
- [ ] **M0-F5** Manual commands (hub and/or `/operate`): motor run/stop at duty % — route only when NVS = `hbridge`.
- [ ] **M0-F6** Reject relay `stroke` / relay-shaped automatic payload when NVS = `hbridge` (and vice versa).
- [ ] **M0-F7** Extend **`GET /api/local/caps`** (and device status if applicable): `actuatorKind`, motor duty limits (placeholder OK).
- [ ] **M0-F8** Serial diagnostics: `[MOTOR]` PWM/enable state for bench without PCB optional.

### 3.2 Protocol & docs

- [ ] **M0-P1** PROTOCOL draft: motor caps fields; manual command keys; link from [31](./31-Motor-Actuator-Device-Design.md).

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

- [ ] **M1-R1** `PairDeviceRequestDto` + `PairDeviceMessageDto`: **`actuatorKind`**.
- [ ] **M1-R2** `POST /api/devices/pair`: accept `actuatorKind`; persist on server device record.
- [ ] **M1-R3** SomNet.UI Hardware pairing: **“Register as relay or motor?”** control.
- [ ] **M1-R4** Firmware `PairDevice` handler: write NVS if unbound; **reject mismatch** if already bound.
- [ ] **M1-R5** Rebind documented: revoke + device reset + re-pair (operator doc or Hardware UI copy).
- [ ] **M1-R6** PROTOCOL §4.2 updated with `actuatorKind` in `PairDevice` arguments.

### 4.2 Firmware — motor automatic FSM

- [ ] **M1-F1** Separate **motor automatic FSM** (do not overload relay-only `AutomaticSessionMode` indefinitely) — MA-D10.
- [ ] **M1-F2** `automatic-start` validation: NVS `hbridge` + motor JSON schema.
- [ ] **M1-F3** **Periodic** mode only for v1 sign-off (MA-D14 first ship).
- [ ] **M1-F4** `endSessionMode`: **`minutes`** and **`noAutoEnd`** only — **no** rotation/stroke count (MA-D20).
- [ ] **M1-F5** `automatic-stop` / abort: MA-D4 (PWM off, enables low).
- [ ] **M1-F6** Terminal **`resultJson`** (motor schema — PROTOCOL); hub ack / session complete path like relay.
- [ ] **M1-F7** Ramp hook in FSM structure (may use fixed `rampMs` default until UI exposes it).

### 4.3 SomNet.Shared & API

- [ ] **M1-S1** `MotorAutomaticControlStateDto` (or equivalent) — separate from `AutomaticControlStateDto` (MA-R6).
- [ ] **M1-S2** API validation on hub command dispatch for motor vs relay device registration.
- [ ] **M1-S3** Motor session summary builder for history (parallel to relay).

### 4.4 SomNet.UI

- [ ] **M1-U1** Motor automatic form: duty min/max, segment timing, end session (no stroke-ms; no count end mode).
- [ ] **M1-U2** Hide relay-only controls when device/caps `actuatorKind` = `hbridge`.
- [ ] **M1-U3** Start / Stop / Abort E2E on paired motor device.

### 4.5 Tests

- [ ] **M1-T1** Unit/integration tests for motor DTO validation (API or Shared).
- [ ] **M1-T2** Manual test script or checklist run recorded (pair → arm → periodic → result).

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
| **Skipped for MVP?** | ☐ Yes — defer post-M3 |
| **All M1b items complete** | ☐ |

---

## 6. Phase M2 — SomEsp standalone (local API)

**Prerequisite:** **M1 sign-off** complete.

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
| M0 | Not started | |
| M1 | Not started | |
| M1b | Optional / skipped | |
| M2 | Blocked on M1 | |
| M3 | Blocked on M2 | |
| M4 | Optional | |

---

## 10. Document history

| Date | Change |
|------|--------|
| 2026-10-25 | Initial plan + checklists from doc 31 |
| 2026-10-25 | Git: branch from `SomEsp` → `feature/motor-actuator` |
