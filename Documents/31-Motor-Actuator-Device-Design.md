# Motor (H-bridge) actuator — early design

**Status:** **Hub path implemented** (M1 + M1b + M1c — see [§13](#13-as-built--hub-path-motor-programs-ui-telemetry)). Standalone/gateway remain MA-R5 steps 2–3. Pin map provisional in `boardDefs.h` until unified PCB exists. Checklists: [32](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md).

**Audience:** Firmware (`SomNet.Device`), `SomNet.Shared`, `SomNet.Device.LocalClient` / **LocalGateway**, main app (TheSystem), and eventually SomNet.API / UI if the motor device joins the hub path.

| Related | Link |
|---------|------|
| Relay / SomEsp standalone | [27 — SomEsp standalone device plan](./27-SomEsp-Standalone-Device-Plan.md) |
| LAN job flow & local API | [28 — Scheduled jobs — local device integration](./28-Scheduled-Jobs-Local-Device-Integration.md) |
| Gateway & multi-`deviceId` (P7-D2) | [29 — Device local gateway](./29-Device-Local-Gateway-Implementation-Plan.md) §P7-D2 |
| Main app integration | [30 — Main app device gateway integration](./30-Main-App-Device-Gateway-Integration.md) |
| Integration runbook | [SomNet integration runbook](./SomNetIntegrationRunbook.md) §9.7 |
| Wire payloads (relay today) | [SomNet.Device/docs/PROTOCOL.md](../SomNet.Device/docs/PROTOCOL.md) §6 |
| Relay automatic parameters (today) | `SomNet.Shared` → `AutomaticControlStateDto` |
| Burst placement (relay shipped; motor BP-E) | [36 — Burst placement modes](./36-Burst-Placement-Modes-Design.md) · [§5.2.1](#521-bursts-in-motor-automatic-design-locked-2026-10-27) |
| ESP32 pin map (relay today) | [SomNet.Device/include/boardDefs.h](../SomNet.Device/include/boardDefs.h) |
| **Implementation plan & sign-off** | [32 — Motor plan & checklists](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md) · [Phase M1d](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md#52-phase-m1d--motor-automatic-bursts--placement-bp-e) |

---

## 1. Product intent

SomNet today drives a **relay** on the ESP32 with **device-side timing** (stroke duration, bursts, automatic programs). Motor support adds an **H-bridge + motor** path (PWM, enable, segments) with the **same session and network patterns** (Wi‑Fi, PIN, arm/disarm, commands, stop/abort, `resultJson`).

### 1.1 Platform strategy (why one board + one firmware)

| Layer | Intent |
|-------|--------|
| **Codebase** | **One** `SomNet.Device` tree — relay and motor backends, gated FSMs, single release binary (MA-R2). |
| **PCB** | **One** microcontroller board design developed for **either** use case: same ESP32, button, LED, session accessory, and **header/pinout** for an **output module**. |
| **Output module (field assembly)** | Operator or factory connects **either** a **relay module** (e.g. to `PIN_RELAY`) **or** a **BTS7960 H-bridge module** (motor pins in `boardDefs.h`) — not both modules required on every unit. |
| **Behavior** | **`actuatorKind`** (NVS + handshake) and **commands** select relay vs motor software; **wiring** selects what is physically on the bus. |
| **Future** | The **relay pin** or **motor pin group** may later support **other** daughterboards or use cases; **none planned** now — keep drivers behind `IActuatorDriver` / separate FSMs so new output types do not fork Wi‑Fi or hub code. |

This avoids maintaining **two PCBs** and **two firmware lines** for relay vs motor products; it matches how installs differ (relay ESP vs motor ESP on the same gateway) while the **platform** stays common.

Goals:

| Goal | Notes |
|------|--------|
| **Same operator mental model where it fits** | Scheduled “programs” with analogous modes — not necessarily identical JSON across actuators (MA-R6) |
| **One SomNet identity per physical unit** | Stable **`deviceId`** per ESP; relay-configured and motor-configured units are separate rows in gateway `Device:Devices[]` (P7-D2) |
| **Thin gateway** | Gateway routes and enforces **per-device concurrency**; it does **not** run motor timing loops |
| **Honest history** | Job records store **actuator-appropriate** parameter snapshots and **`resultJson`** |

Non-goals: **concurrent relay + motor automatic sessions** on one ESP; **two output modules active at once** in v1; multi-motor on one ESP; OTA policy unchanged unless added later.

> **Remit correction (2026-10-26):** A **single Sub** must host **multiple** hardware devices (relay + motor, etc.). **Implemented** on the hub path via spike **X-6** — see [§12 — Multi-device per Sub](#12-multi-device-per-sub).

**Signed product rules (2026-10-25):**

| ID | Rule |
|----|------|
| **MA-R1** | **One platform board, one module** — same MCU PCB; attach **relay module** or **H-bridge module**; firmware can drive either pin set; **profile + commands** select behavior; the **other** output pins stay idle when only one module is fitted. |
| **MA-R2** | **One firmware binary** includes **both** backends; **`actuatorKind`** is **requested on initial contact** (hub handshake and/or first local unlock) and **persisted to NVS** so later commands are validated against a single source of truth — reducing clashes from hosts sending relay payloads to a motor-configured unit (or vice versa). Gates driver + FSM (MA-R7). Shell payloads may carry `actuatorKind` (MA-R6). |
| **MA-R7** | **Gated FSMs** — **separate** relay vs motor automatic state machines (or clearly split modules); only the profile-selected FSM + `IActuatorDriver` are **initialized** for that session/connection. Inactive path stays unloaded or inert for **CPU/RAM** and safety (no stray GPIO). |
| **MA-R3** | **Autonomous sessions** — once `automatic-start` (or hub/local equivalent) is accepted, the ESP runs the full program internally; hosts poll status and may **stop/abort**; completion produces **`resultJson`** and callbacks aligned with relay behavior. |
| **MA-R4** | **End-state host coverage** — motor must eventually work on **hub-paired web path** (ESP device HTTP + SomNet.API / UI / SignalR), **SomEsp standalone** (`/api/local/*`), and **LAN gateway** (TheSystem). Timing/PWM logic stays on the ESP in all cases. |
| **MA-R5** | **Delivery order (same as relay history)** — implement and prove on **(1) hub firmware + device web/API**, then **(2) standalone profile**, then **(3) gateway / scheduler**. Do not block motor driver work on gateway or local API; **do not** ship standalone/gateway motor paths until the hub path behavior is signed off. |
| **MA-R6** | **Payload shape** — **Connection, handshake, and session shell** use **one common** schema on relay and motor (unlock/arm/disarm/lock, tokens, command accept, stop/abort envelope, gateway auth, correlation IDs, shared status fields). **Program / automatic parameters**, presets, **`resultJson` program stats**, and **host UI** are **actuator-specific** where use cases differ. **Do not** force motor programs into `AutomaticControlStateDto`. |

---

## 2. Hardware — platform board & output modules

### 2.1 Unified MCU board

- **Single PCB design** for relay and motor products: ESP32 DevKit-class pin plan (`boardDefs.h`), **D33** button, **D2** LED, **D32** session accessory, plus routed signals for **relay** and **motor** headers (populated per SKU in manufacturing or assembly).
- **Not built yet** — pin numbers remain provisional until layout; firmware proceeds against `boardDefs.h`.

### 2.2 Relay module (existing)

| Signal | GPIO |
|--------|------|
| Relay control | **D4** (`PIN_RELAY`) |

Connect commercial relay/opto module to the platform **relay** header.

### 2.3 Motor module (BTS7960)

| Item | Choice |
|------|--------|
| **Driver module** | **BTS7960** H-bridge board (dual half-bridge: **R** and **L** inputs) — plugs to **motor** header on same platform PCB |
| **Primary channel** | **D25** — PWM · **D27** — enable (maps to one side of the module, e.g. RPWM + R_EN) |
| **Secondary channel** | **D26** — PWM · **D14** — enable (opposite direction, e.g. LPWM + L_EN) |
| **Direction policy (software)** | **v1:** automatic and manual programs use **primary channel only** (single direction). **Hardware** is wired for both channels so reverse can ship later without a board spin. |
| **Operator I/O** | Shared on platform: **D33** button, **D2** LED, **D32** session accessory |

Software can command **either** output family; a given **assembled unit** only **responds on the fitted module**. Active profile (NVS + handshake) selects which backend/FSM runs so the unused path does not drive the wrong header. All pins in `boardDefs.h` (`PIN_RELAY`, `PIN_MOTOR_*`).

**Driver rules (firmware):** Never PWM both channels at once; switching direction requires **both enables low**, PWM off, **dead time**, then enable the target channel (exact ms TBD on bench).

**Bench tuning:** Set **`MOTOR_PWM_FREQUENCY_HZ`** and **`MOTOR_ENABLE_ACTIVE_HIGH`** in `boardDefs.h` when the BTS7960 module is wired (defaults are placeholders — MA-D18).

**Pin authority:** GPIO numbers are **proposed** until the **unified** platform PCB is laid out; **`boardDefs.h`** is the single source of truth. One `.bin` for all assemblies; set **`actuatorKind`** via NVS/config to match the connected module (§6.1).

### 2.4 Footnote — hardware actuator straps (production hardening, maybe)

**Status:** **Not planned for v1** — optional **PCB / manufacturing** feature if software-only registration (MA-D12) needs extra safety in production.

| Idea | Detail |
|------|--------|
| **Pins** | **Three** GPIOs configured as **inputs** (pull-ups + strap to GND on the module or PCB), read **once at boot** before outputs enable. |
| **Encoding** | 3-bit binary code → **8** values (`0`–`7`); map to an **`actuatorProfileId`** table (e.g. `0` = unconfigured, `1` = relay, `2` = h-bridge motor, `3`–`7` reserved for **future** actuator modules — up to **seven** distinct product types plus a reserved/unfitted pattern). |
| **Use** | **Cross-check** NVS / registration: if operator paired as **motor** but straps read **relay**, refuse arm/pair or stay in fault until resolved. Straps reflect **what is physically built**, not what a host mistakenly selected. |
| **Not a replacement** | Registration (“relay or motor?”) remains required for hosts and presets; straps are a **second factor** on the device, not user-editable over the network. |
| **Layout** | Strap pin numbers **TBD** on unified PCB (`boardDefs.h` when defined); may live on a **module** connector so the base board reads module type. |

```text
Boot:  read strap[2:0]  →  hardwareProfileId
       read NVS actuatorKind  →  softwareProfileId
       if production check enabled and ids disagree  →  safe idle / fault (policy TBD)
```

Implement only when registration hardening is on the production checklist; document strap table in manufacturing notes when pins are assigned.

---

## 3. Two independent axes

Do not conflate these:

```text
deviceId          — which ESP on the LAN (P7-D2, DHCP, pairing, run history)
actuatorKind      — how this ESP energizes its load (relay | hbridge | …)
```

| Axis | Example | Config / discovery |
|------|---------|-------------------|
| **`deviceId`** | `esp32-84CCA85C36B4` | Gateway `Device:Devices[]`; firmware `GET /api/status` |
| **`actuatorKind`** | `relay` vs `hbridge` | NVS default + **handshake** (§6.1) → caps, status, and which FSM is live |

A home install might run **one gateway** with **two ESPs**: one wired as relay, one as motor — same firmware on both; different NVS/handshake profile, `deviceId`, and program payloads (P7-D2).

---

## 4. What stays the same (reuse)

These layers should remain stable across actuator types:

| Layer | Pattern |
|-------|---------|
| **LAN HTTP shell** | `POST /api/local/unlock` → Bearer → `arm` → `POST /api/local/commands` → poll `GET /api/local/status` |
| **Command accept** | `commandKey` + `payloadJson`; immediate `accepted` + `correlationId`; completion via status / `resultJson` |
| **Safety gating** | Unlock + arm before motion; **stop** / **abort** on automatic-stop (same semantics as relay — see §8) |
| **Scheduled jobs** | Main app → `IDeviceGatewayClient` → LocalGateway `automatic/run` with **`deviceId`** → same coordinator single-flight **per device** |
| **Identifiers** | Persist **`deviceId`** on presets and run history — not IP |
| **Session feedback** | In-flight status, correlation IDs, graceful stop vs abort, terminal **`resultJson`** for history — **same contracts as relay**, motor-specific fields inside JSON |

**Session shell** (arm, busy, stop/abort, correlation) stays **shared**; **automatic program execution** uses a **relay FSM** or **motor FSM** (MA-R7) — not one FSM with relay-only internals. Mode/end-session **concepts** may parallel each other; implementation is per kind.

**Control surfaces — delivery order (MA-R5):**

| Order | Surface | Role |
|-------|---------|------|
| **1 — first** | **Hub-paired ESP + web** | Device **`/operate`** (and related LAN HTTP on the **hub** PlatformIO env); **SignalR** hub commands (`automatic-start`, stop, etc.); **SomNet.UI** when paired — same sequence used for relay before SomEsp/gateway |
| **2 — after hub proven** | **SomEsp standalone** | Same firmware; NVS motor profile + **`env:somesp`** (hub off): **`/operate`** + **`/api/local/*`**; reuse command keys and FSM from step 1 |
| **3 — last** | **Device local gateway** | TheSystem / `IDeviceGatewayClient` → `automatic/run`; thin HTTP proxy only — no new motor logic on the gateway host |

---

## 5. What must diverge

### 5.1 Physical output

| Relay (today) | Motor (BTS7960) |
|---------------|-----------------|
| GPIO pulse on D4 during “stroke” | **PWM duty** on **D25** (primary) while segment active; **D27** enable on; secondary **D26/D14** off in v1 |
| Abort → de-energize relay quickly | Abort → **PWM off**, **enable outputs low** (D27/D14 deasserted) — **MA-D4** |
| `minimumPower` / `maximumPower` → stroke intensity semantics | **Same fields (conceptually): min/max speed** → **PWM duty %** (0–100) |

### 5.2 Automatic “patterns” (relay semantics → motor)

**Intent:** Keep the **same automatic mode families** (periodic, random power/timing, bursts, end-session rules) so operators and schedulers do not learn a second product. On motor units, the FSM still runs **time-structured segments**, but the **controlled variable during an active segment is PWM duty (speed)**, not relay on-time / stroke milliseconds.

| Relay concept | Motor interpretation |
|---------------|----------------------|
| **Minimum / maximum power** | **`minimumDutyPercent` / `maximumDutyPercent`** — logical speed band (PWM duty 0–100). May later **scale** module duty to a calibrated “real world” % (**MA-D19**). |
| **Stroke duration (ms)** | **Not used** for motor (or ignored); segment length uses **stroke min/max seconds** (or equivalent segment timers) |
| **Periodic** | **v1 first ship** — same timing ideas as relay; duty held or stepped per segment within min/max duty band |
| **Random power/timing** | Same **mode family** as relay after periodic; duty targets change between segments — motor FSM must **ramp** PWM between speeds (relay may jump % instantly) — **MA-D14** |
| **Bursts** | Same **schedule + placement** as relay ([doc 36](./36-Burst-Placement-Modes-Design.md)); burst **clusters** use **ramped speed** steps — [§5.2.1](#521-bursts-in-motor-automatic-design-locked-2026-10-27) |
| **End session** | **v1:** time-based (**minutes**) and **no auto end**; **segment** stop in software if needed — **not** rotation/**count** (**MA-D20**). **`resultJson`** documents actual end reason. |

**MA-D14 — speed transitions:** Motor automatic FSM includes a **ramp** state (duty Δ over time) when moving from one target duty to another. Parameters (ramp ms, max slew rate) TBD in motor DTO/caps; **no instant** duty jumps for random/burst modes. Periodic v1 may use simpler hold/ramp-at-segment-start only.

Similar **operator concepts** do not imply a **shared JSON schema**. Relay and motor may use different property names and DTOs where the use case diverges (MA-R6).

### 5.3 Payload strategy (MA-R6)

**Two layers:**

| Layer | Share? | Examples |
|-------|--------|----------|
| **Transport & session shell** | **Yes — common payloads** | Hub handshake ([PROTOCOL.md §2](../SomNet.Device/docs/PROTOCOL.md)) + **`actuatorKind` on first contact** (host declares intended profile); `POST /api/local/unlock` may include **`actuatorKind`** on first provisioned session → device **writes NVS** and echoes bound kind; arm/disarm/lock; command **accept**; status includes **bound** `actuatorKind`; **`automatic-stop`** (`abort`); gateway auth/correlation; `deviceId` |
| **Program & history body** | **Per actuator when different** | **`automatic-start` `payloadJson`** (relay `AutomaticControlStateDto` vs motor DTO); caps **limits** (`maxStrokeMs` vs max duty); terminal **`resultJson`** program statistics; SomNet/UI **preset forms**; TheSystem **preset columns** |

| Principle | Rule |
|-----------|------|
| **Common shell DTOs** | One set of Shared/host types for unlock, command accept, stop/abort, and shared status — **no** relay/motor fork for handshakes or connections. |
| **Split program DTOs** | Relay keeps **`AutomaticControlStateDto`**. Motor gets **its own** start payload and result schema (`MotorAutomaticControlStateDto`, etc.). |
| **Shared enums only when identical** | e.g. `endSessionMode` **only** if both actuators implement the same mode with the same meaning; otherwise motor-specific enums/names. |
| **No union DTO soup** | Do not merge shell + program into one mega-type. Presets/runs: **`ActuatorKind`** + kind-specific program JSON. |
| **ESP** | Shared dispatch for shell commands; **`automatic-start`** validated per caps `actuatorKind`. |
| **Gateway** | Common run/stop/status paths; **program JSON** opaque pass-through per device. |

**Relay (unchanged):** `AutomaticControlStateDto` — stroke ms, bursts, relay power band, etc.

**Motor (illustrative — names TBD in PROTOCOL):**

```json
{
  "actuatorKind": "hbridge",
  "automaticMode": "randomSpeedAndTiming",
  "minimumDutyPercent": 20,
  "maximumDutyPercent": 80,
  "minimumSpeedPercent": 10,
  "maximumSpeedPercent": 90,
  "segmentMinSeconds": 5,
  "segmentMaxSeconds": 20,
  "delayBeforeStartSeconds": 0,
  "rampMs": 500,
  "endSessionMode": "minutes",
  "endSessionValue": 30
}
```

**Motor `automaticMode` (hub path — as built):** `periodic` (UI: **Set Speed**), `randomSpeed`, `randomSpeedAndTiming`, `powerWave`, `buildUp`. Legacy aliases `randomPowerOnly` / `randomPowerAndTiming` parse on the device. Relay-only modes (`randomTimingOnly`, `powerAndTimingWave`, …) are rejected for motor profiles.

**Speed vs duty:** Programs carry **both** `minimumDutyPercent` / `maximumDutyPercent` (PWM ceiling for the H-bridge path) and `minimumSpeedPercent` / `maximumSpeedPercent` (program target envelope). The operator **pattern graph** plots **commanded speed %**; firmware maps speed → duty when applying ramps.

**Motor `endSessionMode` (v1 — MA-D20):** Support **`minutes`** and **`noAutoEnd`** (motor-specific names in PROTOCOL when written). **Do not** offer **stroke/rotation count** end modes until a **Hall sensor** (or similar) exists — **v2** hardware may add **`rotationCount`** (or equivalent) as a valid end mode. Relay **`EndSessionMode.Strokes`** does not apply to motor v1.

**Duty fields (MA-D19):** `minimumDutyPercent` / `maximumDutyPercent` are the v1 program fields; firmware may apply an internal scale factor later if module duty ≠ perceived speed.

Only include **shared** envelope pieces in both schemas when product signs off they are truly common (MA-D2).

### 5.2.1 Bursts in motor automatic (design locked 2026-10-27)

**Status:** **Implemented (core)** — firmware **`0.16.0-motor-burst`** ([32 — Phase M1d](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md#52-phase-m1d--motor-automatic-bursts--placement-bp-e), doc 36 **BP-E**). **UI + API + DTO** round-trip burst fields; **`MotorAutomaticSessionMode`** runs burst clusters via shared `automatic_burst_runtime`. **Open:** burst segment telemetry during clusters (M1d-F10), preview graph (U1), operator bench sign-off.

**Goal:** Operators use the **same six placement options** and percent semantics as relay ([36 §3](./36-Burst-Placement-Modes-Design.md)), without learning a second product. Motor execution differs: **PWM ramps** and **segment timing**, not relay pulses.

#### Main beat (what “main stroke” means on motor)

| Program mode | Main beat | `mainSegmentsCompleted` counter |
|--------------|-----------|----------------------------------|
| **`periodic` (set-speed hold)** | **No segment boundaries** after initial ramp — motor holds one target speed until stop or minutes end | Stays at **1**; **do not** use stride/milestone/chance placements that need repeating beats |
| **`randomSpeed`**, **`randomSpeedAndTiming`**, **`powerWave`**, **`buildUp`** | End of each **program segment** (when a segment ramp finishes and the next segment would start) | **`segmentsCompleted_`** after each completed segment ramp (same index used for schedule math) |

**Placement support matrix (v1 motor burst):**

| Schedule | `periodic` | Segmented modes |
|----------|------------|-----------------|
| **Spread** (`*SessionSpread`) | **Minutes only** — wall-clock deadlines between holds (reuse `WallClockDeadlines` in gap polling) | Minutes + `noAutoEnd` (wall-clock / cadence per doc 36) |
| **Even** (`*AfterMainStroke`) | **Not offered in UI** when mode = periodic, **or** firmware treats as no-op with serial hint | Full support (stride / stroke milestones on segment index) |
| **Chance** (`*ChanceAfterMainStroke`) | **Not offered** for periodic (same as even) | Full support |

**UI rule (M1d):** When `automaticMode === 'periodic'`, disable or auto-coerce placements that require a repeating main beat (even/chance; spread non-minutes). Segmented modes expose all six placements.

#### Main+ vs instead-of (doc 36)

| Timing | Motor hook (segmented modes) |
|--------|------------------------------|
| **Main +** | After segment ramp completes (`segmentsCompleted_` incremented), if schedule fires → enter **burst sub-FSM**, then continue program |
| **Instead of main** | Before `beginSegmentTransition()` for the next segment, if schedule fires → **burst sub-FSM** and **skip** that segment’s program transition |

Wall-clock **session spread + minutes** runs in **`poll`** while idle between segment work (same idea as relay `WaitingGap`).

#### Burst cluster (motor shape — MA-D14)

Relay burst = `burstStrokes` relay pulses + `burstDelayMs` open gaps. Motor burst = **`burstStrokesMin`–`burstStrokesMax` micro-cycles**, each cycle:

1. **Ramp** commanded speed from current program target toward **burst target speed** over `rampMs` (or a burst-specific ramp cap TBD — default: session `rampMs`).
2. **Hold** at burst target for a **fixed micro-duration** derived from session stroke-ms limits **or** a motor-specific default (e.g. 200–400 ms equivalent “pulse width” at burst duty) — **MA-D26** bench tune.
3. **Intra-burst gap:** ramp/hold at **reduced speed** (or duty floor) for `burstDelayMin`–`burstDelayMax` **seconds** (drawn per gap like relay).

**Burst target speed:** Map `burstStrokePowerMin` / `burstStrokePowerMax` (0–100 **relative**) into the session **`minimumSpeedPercent`–`maximumSpeedPercent`** envelope (same idea as relay `resolveBurstEffectivePower` on `minimumPower`/`maximumPower`), then `motorSpeedPercentToDuty`.

**`burstStyle`:** Same four styles as relay — random draws per micro-cycle for power and/or delay (`drawBurstRelativePower` / `drawBurstDelaySec` logic shared or ported).

**Abort / Stop:** Match Phase 10 intent — **Abort** cuts PWM immediately; **Stop** finishes current ramp/micro-hold or **entire burst cluster** (cooperative, same as relay P10-D3).

#### Shared firmware module

Reuse **`automatic_burst_runtime`** (plan build, milestone/stride/chance, `burstInsteadOfMain`, replan) by feeding a **motor adapter**:

- `endSessionMode`: only **`minutes`** \| **`noAutoEnd`** (map to relay plan input).
- `mainStrokesCompleted` ↔ `segmentsCompleted_` (segmented modes only).
- Parse `burstPlacement` via same strings as relay (`parseBurstPlacement` or shared helper).

Do **not** fork placement formulas in a second TS/C++ implementation.

#### Validation (MA-D27)

**Periodic + bursts:** `parseMotorAutomaticConfig` rejects invalid combos (e.g. even/chance placement or `noAutoEnd` without minutes envelope) via `motorBurstSettingsAllowed()` — aligns with UI coercion in **M1d-U2**.

#### `resultJson` (motor burst tier 1)

Extend motor automatic stop summary (align with relay tier 1):

| Field | Notes |
|-------|--------|
| `burstEventsCompleted` | Count of finished burst clusters |
| `burstPlacement` | Wire string echo |
| `segmentsCompleted` | Main program segments only (exclude intra-burst micro-cycles) |

Optional later: chance roll audit fields (doc 36 §11).

#### Telemetry

During burst micro-cycles, emit **`motor-automatic-segment`** acks (same correlation id as M1c) so the **live pattern graph** shows dips/clusters. Preview graph uses seeded placement logic in `motorSpeedSchedule.ts` (M1d-U1).

#### Decisions (this section)

| ID | Decision |
|----|----------|
| **MA-D25** | Motor burst uses **doc 36** placements and percent meanings; execution is **ramped speed clusters**, not relay pulses |
| **MA-D26** | Micro-hold duration per burst stroke: **`kMotorBurstMicroHoldMs` = 300** (`motor_automatic_burst.h`); noted in `boardDefs.h` |
| **MA-D27** | **`periodic`** + bursts: **session spread + minutes only**; even/chance disabled in UI for periodic |

---

### 5.4 Host integration (web API & TheSystem)

| Host | Approach |
|------|----------|
| **SomNet.UI / API** | Separate forms and API models per **`actuatorKind`**; hub commands carry the **correct** payload shape for the paired device. UI does not bind motor jobs to relay stroke-ms controls. |
| **TheSystem presets** | Preset entity stores **`ActuatorKind`** + **typed or JSON column per kind** (relay snapshot vs motor snapshot) — not a single `AutomaticControlStateDto` column for all devices. |
| **TheSystem scheduler / admin run** | `RunAutomaticAsync(deviceId, …)` sends the preset payload for that registration’s kind; server validates kind matches `deviceId` registration (and optionally gateway caps). |
| **Run history** | `ParametersSnapshot` and `ResultJson` are **per-actuator** shapes (or JSON blob + `ActuatorKind`); summary builders are **relay vs motor** ([30 §4](./30-Main-App-Device-Gateway-Integration.md)). |
| **SomNet.Shared** | `ActuatorKind` enum + **separate** DTO types; shared pieces (e.g. enums) only in small shared modules — not by extending relay DTOs. |

### 5.5 Results and summaries

Relay `resultJson` keeps stroke/burst vocabulary. Motor **`resultJson`** is a **motor-specific** schema (segments completed, duty stats, end reason, `actuatorKind`) — **PROTOCOL TBD**; no rotation count field until Hall v2. SomNet-style **summary strings** use a **motor-specific builder**.

---

## 6. Architecture (target seams)

### 6.1 ESP firmware

```text
Hub handshake / local unlock  →  actuatorProfile (actuatorKind)
                                        ↓
CommandHandler  →  route by command + profile
                        ↓
           RelayAutomaticFsm ──→ RelayBackend (D4)
           MotorAutomaticFsm  ──→ MotorBackend (BTS7960 pins)
           (only one FSM + driver pair constructed / active — MA-R7)
```

- **RelayBackend:** existing `relay_controller` (pulse, abort).
- **MotorBackend:** BTS7960 **D25/D27** (+ **D26/D14** when used); abort clears PWM/enables.
- **FSMs:** Prefer **two implementations** (relay vs motor) behind a small shared interface (arm, busy, start program, stop, abort, `resultJson`). Do **not** keep growing `AutomaticSessionMode` with relay-only branches if motor FSM diverges; **gate** so the inactive FSM is never ticked.

**Packaging (MA-D3):** **Single flash image** — both backends + both FSMs in the binary; **one active pair** at runtime. **`env:somesp`** = hub on/off only.

**Actuator profile — initial contact → NVS (MA-D12):**

| Stage | Behavior |
|-------|----------|
| **First bind (preferred — hub)** | **Device registration / pairing** completes binding: operator answers **“Register this device as relay or motor?”** in SomNet UI (or API). Request includes `actuatorKind`; server persists on **device registration** and pushes kind to ESP in **`PairDevice`** (see §6.2). Firmware writes **NVS** on `PairDevice`, inits driver + FSM. |
| **First bind (LAN / standalone)** | If not hub-paired: **`POST /api/local/unlock`** (or `/config` provisioning) carries the same **`actuatorKind`** choice on first successful contact; then NVS + init as above. |
| **Already provisioned** | Device loads kind from **NVS** at boot. Handshake/unlock **must match** stored kind (or omit and device echoes NVS). **Mismatch → reject** connection or unlock with clear error — host must fix registration/preset, not send relay programs at a motor-bound `deviceId`. |
| **Changing kind** | **Not** silent on every connect. Requires explicit operator action: `/config`, factory reset, or trusted “rebind profile” flow while **disarmed** — then new `actuatorKind` written to NVS and FSM/driver re-init. |
| **Caps / status** | Report **NVS-bound** `actuatorKind` and limits for that kind only (`GET /api/local/caps`, device status, gateway probe). |
| **Commands** | `command_handler` checks payload against **NVS kind** before dispatch — relay `stroke` / relay `automatic-start` vs motor program JSON; **409/400** on cross-kind (same goal as gateway host-side validation). |
| **Hosts (web API & TheSystem)** | **Registration record** and **ESP NVS** must agree: SomNet `POST /api/devices/pair` + DB row; TheSystem **add device** ([30 §5](./30-Main-App-Device-Gateway-Integration.md)). UI only offers relay presets for relay registrations, motor presets for motor. |
| **Concurrency** | One automatic session at a time; not relay + motor concurrently (non-goal). |
| **Performance** | Inactive backend not ticked; init after NVS kind known at boot or after first-contact write. |

```text
First contact:  host actuatorKind  →  write NVS  →  init driver + FSM
Later boot:     read NVS           →  init driver + FSM
Every command:  validate vs NVS kind  →  accept | reject
```

**Rationale:** One platform PCB and one firmware for two module SKUs; **binding during registration** stops “wrong preset reached the wrong device” when DHCP, `deviceId`, or operator error would otherwise mix relay and motor message shapes.

### 6.2 Device registration — “relay or motor?” (hub path — implemented)

Binding **`actuatorKind`** is part of **completing registration**, not an afterthought on random commands.

**SomNet (hub path — MA-R5 step 1):**

| Step | Actor | Action |
|------|--------|--------|
| 1 | Operator | Hardware dialog: select unpaired `deviceId`, choose **Sub**, choose **Actuator type: Relay \| Motor** (matches module on platform board). |
| 2 | SomNet.API | `POST /api/devices/pair` — extend body with **`actuatorKind`**; persist on device registration (**approved** — implement with motor M1). |
| 3 | Hub | `PairDevice` — extend **`PairDeviceMessageDto`** with **`actuatorKind`** ([PROTOCOL.md §4.2](../SomNet.Device/docs/PROTOCOL.md)). |
| 4 | ESP | On `PairDevice` (§6.2): verify `deviceId`, if NVS unbound write **`actuator_kind`**, if bound reject **mismatch** with pair failure; then persist JWT and reconnect paired. |
| 5 | UI | After pair, automatic/manual screens use **relay** or **motor** forms only (MA-R6). |

**TheSystem (gateway path — later step 3):**

| Step | Actor | Action |
|------|--------|--------|
| 1 | Operator | **Add device**: gateway list → `deviceId` → **Register as relay or motor?** |
| 2 | DB | `SomNetDeviceRegistration.ActuatorKind` set at insert ([registry doc](../../TheSystem/Docs/SOMNET_DEVICE_REGISTRY.md)). |
| 3 | First unlock / status | Confirm caps `actuatorKind` matches registration; block admin run if mismatch. |

**Re-registration / module swap:** **Approved:** **revoke** pairing (or clear registration) + **factory reset / rebind** on device + pair again with new **`actuatorKind`** — no silent NVS overwrite.

**Not planned in v1:** Auto-detect module type from hardware; operator declaration at registration is the source of truth.

### 6.3 Gateway and LocalClient

| Component | Motor work |
|-----------|------------|
| **LocalGateway** | Pass-through JSON; reject obvious kind mismatch (relay DTO to motor `deviceId`); no motor timing |
| **LocalClient** | `RunAutomaticAsync` accepts **actuator-appropriate** body (typed overloads or JSON document); **separate** result mappers per kind |
| **`DeviceGatewayConfiguredDeviceDto`** | Future: optional `ActuatorKind` (from gateway list or caps proxy) |

P7-D2 already supports **multiple `deviceId`s**; motor is **not** a gateway feature flag.

### 6.4 SomNet.Shared and main app

| Area | Approach |
|------|----------|
| **Shared DTOs** | `ActuatorKind` + **separate** relay/motor parameter & result types; small shared enums only where identical (MA-R6) |
| **TheSystem / scheduler** | Presets and jobs keyed by **`deviceId` + `ActuatorKind`**; motor presets never stored as `AutomaticControlStateDto` |
| **SomNet.API / UI / SignalR** | **Primary test bed (MA-R5)** — develop **firmware alongside API/UI** as with relay; motor-specific hub payloads and forms |
| **Standalone / gateway** | **After hub sign-off** — port proven behavior to local API, then TheSystem/gateway (MA-R5) |

---

## 7. Discovery (proposed)

Extend **`GET /api/local/caps`** (and document in `PROTOCOL.md` when implemented):

| Field | Purpose |
|-------|---------|
| `actuatorKind` | `relay` \| `hbridge` |
| `automaticModes` | Subset supported on this build |
| Limits | e.g. max duty, min/max segment duration, max continuous run |

Optional: gateway **`GET /api/v1/devices`** returns `actuatorKind` per configured `deviceId` by probing caps at startup or on demand (cache + TTL TBD).

Clients **must not** send `AutomaticControlStateDto` to motor devices or treat motor presets as relay DTOs (MA-R6).

---

## 8. Safety and behavior

| ID | Topic | Status |
|----|--------|--------|
| **MA-Q1** | **Abort** | **Settled (MA-D4):** **PWM off**, **enable outputs low** (module enable pins deasserted). |
| **MA-Q2** | **Reverse / D26/D14** | **Settled:** post–v1; primary channel only in first motor release. |
| **MA-Q3** | **Power model** | **Settled:** min/max **duty %**. |
| **MA-Q4** | **Enable outputs (D27/D14)** | **Outputs** to module EN pins. **Settled (MA-D15):** when **disarmed**, **aborted**, or **idle** → **PWM off** and enable driven **inactive** (low if `MOTOR_ENABLE_ACTIVE_HIGH`); when **armed** and running, enable active per polarity. Same gating idea as relay. |
| **MA-Q5** | **Command keys** | **Settled:** single **`automatic-start`** + validation against NVS/caps **`actuatorKind`**. |
| **MA-Q6** | **Stop vs abort** | **Settled:** relay-aligned **`automatic-stop`** / `abort` flag. |
| **MA-Q7** | **Thermal / stall** | **Settled:** **software-only** limits in v1; **no** module feedback assumed; **optional** thermal input later (MA-D16). |
| **MA-Q8** | **NVS binding** | **Settled (MA-D12):** registration writes NVS; rebind flow approved. |
| **MA-Q9** | **Hardware straps** | **Deferred (§2.4, MA-D13).** |

**Tune on module:** `MOTOR_PWM_FREQUENCY_HZ`, `MOTOR_ENABLE_ACTIVE_HIGH` in `boardDefs.h`. **PROTOCOL (in progress):** motor program + **`resultJson`** field list; ramp defaults (**MA-D14**). **Hosts after M1:** standalone + TheSystem/gateway per MA-R5.

---

## 9. Phased roadmap (MA-R5 delivery order)

**Authoritative checklists and sign-off blocks:** [32 — Motor implementation plan & checklists](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md).

| Phase | Summary |
|-------|---------|
| **M0** | NVS `actuatorKind`, motor backend, caps, manual PWM/stop |
| **M1** | Pair/register + periodic automatic + UI/API + `resultJson` |
| **M1b** | *(Optional)* random mode + duty ramp |
| **M2** | Standalone `/api/local/*` parity (after **M1** sign-off) |
| **M3** | Gateway + TheSystem (after **M2** sign-off) |
| **M4** | Reverse, Hall count, straps — optional |

---

## 12. Multi-device per Sub

**Status:** **Implemented on hub path** (X-6.1–X-6.6, signed off **2026-10-27**). Design: [33 — Multi-device per Sub](./33-Multi-Device-Per-Sub-Spike.md). Operator rules: [34 — V2 rules](./34-Operator-Session-And-Accessory-V2-Rules.md).

### 12.1 SomNet.API + database (today)

| Area | Behavior |
|------|----------|
| **DB** | `SubDeviceRegistrations` PK **`(DomTarget, SubName, DeviceId)`** — many devices per Sub (cap **8**). Revoke is per `deviceId`. |
| **Settings** | `DomSubDeviceSettings` — pairing JSON (**relay `automatic`**, **`motorAutomatic`**, **`motorManual`**, …) **per `deviceId`**. |
| **Hub commands** | `deviceId` **required**; dispatcher unicasts to the paired connection for that id. |
| **ESP NVS** | Each unit still stores **one** pairing (`dom` + `sub` + token); many ESPs may share the same Sub name. |

### 12.2 SomNet.UI (today)

| Area | Behavior |
|------|----------|
| **Device roster** | Hardware pairing lists all registrations; header **Focus** picks the active `deviceId` for video/status and the operations column. |
| **Operations panel** | `DeviceOperationsPanel` renders **one block per Focus device** — Scene/Accessory, per-device manual/automatic mode, motion controls (`DeviceOperationScope`). |
| **Scene session** | Server session row + UI state **per `deviceId`**; automatic `running` map keyed by **`(subTarget, deviceId, relay\|motor)`**. |
| **Connection label** | Panel online/offline from **polled** `SystemStatusProvider`, not stale registration flags (`resolveDeviceConnectionLabel`). |

### 12.3 Not in scope (unchanged)

- **One ESP** still runs **one** actuator profile and **one** automatic FSM at a time (MA-D7).
- **Gateway / TheSystem** multi-device orchestration remains **M3** — hub path does not block M2 standalone work.

### 12.4 Tracking

- Spike + decisions: [33](./33-Multi-Device-Per-Sub-Spike.md).
- Checklists: [32 §2.3](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md).
- Schema: [04 — Database schema](./04-Database-Schema.md).

---

## 13. As-built — hub path (motor programs, UI, telemetry)

**Status:** **Signed M1** (periodic + ramp, **2026-10-27**). **M1b modes**, **live `automatic-update`**, **segment graph telemetry**, **manual `motor-run`**, and **motor automatic bursts** (**`0.16.0-motor-burst`**, [M1d](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md#52-phase-m1d--motor-automatic-bursts--placement-bp-e)) on the hub path.

### 13.1 Firmware (`MotorAutomaticSessionMode`)

| Topic | Behavior |
|-------|----------|
| **Motion model** | Continuous run — **no relay-style stroke/gap** main program. Each segment **linearly ramps** commanded speed between targets over `rampMs` (MA-D14). |
| **Modes** | `periodic`, `randomSpeed`, `randomSpeedAndTiming`, `powerWave`, `buildUp` — see §5.3 mode list. |
| **End session** | `minutes` or `noAutoEnd` only (MA-D20). UI coerces stored `strokes` → `noAutoEnd` in start payload. |
| **Stop / abort** | Cooperative `automatic-stop`; `abort` → PWM off, enables inactive (MA-D4/D15). |
| **`automatic-update`** | Queued replan via `queueSessionUpdate` when session active (same JSON shape as start). |
| **PWM init** | Motor hardware init **deferred until Wi‑Fi up** (`main.cpp`) to avoid LEDC/Wi‑Fi contention on boot. |
| **Segment telemetry** | At each ramp, unsolicited hub ack `correlationId: motor-automatic-segment` with `fromSpeedPercent`, `toSpeedPercent`, `durationMs`, `programElapsedMs` (`emitSegmentRamp`). |
| **Bursts** | **Implemented** — [§5.2.1](#521-bursts-in-motor-automatic-design-locked-2026-10-27), firmware **`0.16.0-motor-burst`**. Live graph during burst clusters (**M1d-F10**) still open. |

### 13.2 SomNet.API / Shared

| Topic | Behavior |
|-------|----------|
| **DTO** | `MotorAutomaticControlStateDto` in pairing settings; separate from `AutomaticControlStateDto` (MA-R6). |
| **Validation** | `HardwareCommandPayloadValidator` — motor profile accepts `motor-run`, `motor-stop`, `automatic-start` / `stop` / `update` with motor mode set. |
| **History** | Motor `resultJson` + `AutomaticSessionSummaryBuilder` motor branch (`segmentsCompleted`, duty, duration, `endReason`). |
| **Hub forward** | `CommandAcknowledged` includes **`deviceId`**; segment acks use `HardwareCommandKeys.MotorAutomaticSegmentCorrelationId`. |

### 13.3 SomNet.UI

| Area | Components / utils |
|------|---------------------|
| **Automatic** | `MotorAutomaticControls.tsx` — mode selector (Set Speed / Random / Wave / Build-Up), field rules (`motorAutomaticFieldRules.ts`), start payload (`motorAutomaticStartPayload.ts`). **Abort** always visible (disabled when idle). **Start** calls `ensureAutomaticSessionForDeviceStart()` so scene row exists after stop→start. |
| **Manual** | `MotorManualControls.tsx` — duty slider, `motor-run` / `motor-stop`. |
| **Live overrides** | When Options → General allows automatic overrides while running, debounced **`automatic-update`** (relay and motor). |
| **Pattern graph** | Video column **Feeds \| Graph** (`VideoAsidePanel`); tab persisted in `localStorage` (`videoAsideTabStorage.ts`) after devices load. Preview from settings (`motorSpeedSchedule.ts`); **live** curve from hub segments (`motorAutomaticSegmentStore.ts`, `AutomaticSessionHubListener`). **Now** marker via `motorPatternRunAnchor.ts` + chart zoom (`motorChartViewRange.ts`). **API/UI only** — not standalone ESP `/operate` (see [03 § Motor pattern graph](./03-Frontend-Architecture.md#motor-pattern-graph-scope)). |
| **Running sync** | `OptionsProvider.setDeviceAutomaticRunning`; hub complete clears per device; tab-sync includes `subTarget` + `deviceId` + kind. |

### 13.4 Out of scope on hub path (still MA-R5 later steps)

| Item | Phase |
|------|--------|
| Standalone `/api/local/*` motor parity | **M2** |
| Gateway / TheSystem presets + scheduler | **M3** |
| Motor automatic **bursts** + placement | **M1d** ([32 §5.2](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md#52-phase-m1d--motor-automatic-bursts--placement-bp-e)) — was listed under M4 |
| Reverse channel, Hall end modes | **M4** (optional) |
| Relay automatic **pattern graph** | Deferred |

---

## 10. Decisions log

| ID | Topic | Decision | Date |
|----|-------|----------|------|
| **MA-D1** | Actuator discovery field name | `actuatorKind` in caps (`relay` \| `hbridge`) | 2026-10-25 |
| **MA-D2** | Payload strategy | **Common** connection/handshake/session-shell payloads; **actuator-specific** automatic presets, `resultJson` stats, and host UI (MA-R6) | 2026-10-25 |
| **MA-D3** | Firmware packaging | **One binary** for relay and motor hardware; **NVS `actuatorKind`** selects backend; `env:somesp` = hosting only | 2026-10-25 |
| **MA-D4** | Abort policy | **PWM off**, **enable outputs low** (D27/D14) | 2026-10-25 |
| **MA-D5** | Reuse `automatic-start` key | **Yes** — single key + **`actuatorKind`** / caps validation (**MA-Q5** signed off) | 2026-10-25 |
| **MA-D14** | Motor modes & ramp | **Periodic first**; then random/burst **like relay patterns**; FSM **ramps** duty between targets (no instant jumps) | 2026-10-25 |
| **MA-D15** | Enable output gating | **D27/D14 outputs** — **inactive** when disarmed/aborted/idle (PWM off); **arm** required for motion — **same as relay** | 2026-10-25 |
| **MA-D16** | Thermal / stall | **v1 software-only**; hardware thermal feedback **maybe later** | 2026-10-25 |
| **MA-D17** | Dev process | **SomNet web API/UI** primary test bed; firmware developed **alongside** API like relay | 2026-10-25 |
| **MA-D18** | PWM / enable constants | **`MOTOR_PWM_FREQUENCY_HZ`**, **`MOTOR_ENABLE_ACTIVE_HIGH`** in `boardDefs.h` — bench tuning | 2026-10-25 |
| **MA-D19** | Duty % fields | **`minimumDutyPercent` / `maximumDutyPercent`** for v1; optional duty→speed scaling later | 2026-10-25 |
| **MA-D20** | End session (motor v1) | **No count/rotation** end mode; **minutes** + **noAutoEnd**; **v2** Hall+magnets may enable rotation-based end | 2026-10-25 |
| **MA-D25** | Motor automatic bursts | Same **burstPlacement** as relay ([36](./36-Burst-Placement-Modes-Design.md)); **ramped speed clusters** — [§5.2.1](#521-bursts-in-motor-automatic-design-locked-2026-10-27) | 2026-10-27 |
| **MA-D26** | Burst micro-hold duration | v1 **bench-tuned** per micro-cycle (not motor `strokeMs` DTO) | 2026-10-27 |
| **MA-D27** | Periodic + burst placement | **Session spread + minutes** only; disable even/chance for periodic in UI | 2026-10-27 |
| **MA-D6** | Hardware driver | **Unified MCU board**; motor header → **BTS7960** (**D25/D27**, **D26/D14**); relay header → **D4**; shared **D33/D2/D32** | 2026-10-25 |
| **MA-D11** | Product hardware | **One platform PCB** + **either** relay **or** H-bridge module; future alternate modules possible, none planned | 2026-10-25 |
| **MA-D12** | Actuator binding | **`actuatorKind` chosen at device registration** (pair / add device: relay or motor?) → **NVS on ESP** + **server registration row**; `PairDevice` carries kind to firmware; commands validated vs NVS | 2026-10-25 |
| **MA-D13** | Production hardening (optional) | **Maybe:** 3 strap inputs at boot → 3-bit **`actuatorProfileId`**; cross-check software binding (§2.4) — not v1 | 2026-10-25 |
| **MA-D7** | Active output path | **One active FSM + driver** at a time; firmware **supports both** paths; wiring + profile + commands select behavior — not concurrent relay+motor sessions | 2026-10-25 |
| **MA-D10** | FSM structure | **Separate** relay vs motor automatic FSMs; **gated** init from NVS/handshake (MA-R7) | 2026-10-25 |
| **MA-D8** | Host coverage (end state) | Hub/web, standalone, and gateway **all** required when motor product is complete (MA-R4) | 2026-10-25 |
| **MA-D9** | Delivery order | **Hub + ESP first** → **standalone** → **gateway** (MA-R5); matches relay development sequence | 2026-10-25 |
| **MA-D21** | **Multi-device per Sub** | **Done** (host X-6.1–X-6.6, **2026-10-27**) — [33](./33-Multi-Device-Per-Sub-Spike.md), [32](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md) | 2026-10-27 |
| **MA-D22** | **Session accessory scope** | **Superseded by V2** — [34](./34-Operator-Session-And-Accessory-V2-Rules.md): voluntary **Accessory** per `deviceId`; motion not gated. *(2026-10-26 text: relay-only — historical.)* | 2026-10-26 |
| **MA-D23** | **Multi-device host routing** | **`deviceId` always required** on hub/API commands and history; **≤8 devices/Sub** (MA-D13 strap ceiling, straps optional); **one relay/Sub** v1; PK migration per [33 Q2,Q5–Q7](./33-Multi-Device-Per-Sub-Spike.md) | 2026-10-26 |
| **MA-D24** | **Multi-device product shape** | Concurrent multi-device runs driven by **gateway** orchestration; hub/API = per-device routing + independent FSMs; UI = **no lockout** on a device’s tab; **session not blocked** without relay accessory ([33 §1.1, §4.3.2, §4.8](./33-Multi-Device-Per-Sub-Spike.md)) | 2026-10-26 |

Update this table when choices are made; move settled items to firmware `config.h` / PROTOCOL and Shared enums.

---

## 11. Why this doc exists now

Multi-device gateway work (P7-D2) solves **routing across ESPs**. The **platform board** solves **one manufacture, two products** (relay module vs H-bridge module). Motor software solves **what executes** on the motor header without forking Wi‑Fi, hub, or gateway layers — and leaves room for **future output modules** on the same pin groups without a new codebase.

Implementation tracking: [32 — Motor plan & checklists](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md). Update **§9 progress summary** there when each phase is signed off.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-10-25 | Initial early-design stub |
| 2026-10-25 | BTS7960, D25/D27, single codebase, one-actuator-per-device, PWM patterns, MA-R1–R4, decisions MA-D6–D8 |
| 2026-10-25 | Secondary direction pins **D26** PWM + **D14** enable; v1 firmware primary-only |
| 2026-10-25 | Pin authority = `boardDefs.h`; continue design/dev before motor PCB |
| 2026-10-25 | MA-R5 / MA-D9 — delivery order: hub+ESP → standalone → gateway |
| 2026-10-25 | MA-R6 — common shell vs actuator-specific program payloads (web API & TheSystem) |
| 2026-10-25 | MA-D3 / MA-R2 — **single .bin**; actuator via NVS, not compile-time env |
| 2026-10-25 | MA-R1 / MA-R7 / MA-D10 — either output in one bin; handshake-gated FSMs |
| 2026-10-25 | §1.1 platform board + modular relay/H-bridge; MA-D11 |
| 2026-10-25 | MA-D12 — actuator kind from first contact persisted to NVS; command validation |
| 2026-10-25 | §6.2 — registration UX; `PairDevice` + pair API carry `actuatorKind` (planned) |
| 2026-10-25 | §2.4 footnote — optional 3-pin strap ID at boot (MA-D13); production only |
| 2026-10-25 | MA-Q1/Q4–Q7/Q5, MA-D14–D17 — abort, enable gating, periodic+ramp, API-led dev, registration/rebind |
| 2026-10-25 | MA-D18–D20; boardDefs PWM/enable constants; motor endSession without count until Hall v2 |
| 2026-10-25 | [32 — Implementation plan & phase checklists](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md) |
| 2026-10-26 | §12 + MA-D21 — multi-device per Sub remit; current 1:1 Sub↔device gap; interim two-Sub bench |
| 2026-10-26 | §12.3 — dual-Sub UI scoping (X-6i) documented in [32](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md); does not replace X-6 API work |
| 2026-10-26 | [33](./33-Multi-Device-Per-Sub-Spike.md) — target model, dual-motor UC-4, implementation slices; gates M1b/M2 |
| 2026-10-26 | **MA-D22** — relay-only session accessory; motor outputs in program; per-device FSMs + future super-session |
| 2026-10-26 | **MA-D24** — gateway-led multi-device concurrency; UI per-device non-lockout; session without relay accessory |
| 2026-10-27 | §12 — X-6 implemented; §13 as-built hub path (modes, segment telemetry, pattern graph, UI/API/firmware) |
