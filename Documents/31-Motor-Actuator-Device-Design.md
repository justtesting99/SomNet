# Motor (H-bridge) actuator — early design

**Status:** **Early design** — captures intent while the LAN gateway and multi-device stack mature. **No firmware, gateway, or shared DTO implementation** is committed yet; details will change as hardware and safety rules are proven on the bench.

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

---

## 1. Product intent

SomNet today drives a **relay** on the ESP32 with **device-side timing** (stroke duration, bursts, automatic programs). A **second class of device** is planned: same **network and session patterns** (Wi‑Fi, PIN, arm/disarm, async commands, poll status), but the output stage is an **H-bridge + motor** (PWM speed, direction, on/off segments) instead of a relay pulse.

Goals:

| Goal | Notes |
|------|--------|
| **Same operator mental model where it fits** | Scheduled “programs” with modes analogous to periodic / random timing / end-after-N — not necessarily identical field names |
| **One SomNet identity per physical unit** | Stable **`deviceId`** per ESP; relay unit and motor unit are **two rows** in gateway `Device:Devices[]` (P7-D2) |
| **Thin gateway** | Gateway routes and enforces **per-device concurrency**; it does **not** run motor timing loops |
| **Honest history** | Job records store a **parameter snapshot** and **result JSON** that reflect actuator type |

Non-goals for first motor milestone: cloud hub parity, SomNet.UI feature parity, OTA, multi-motor on one ESP (unless hardware later demands it).

---

## 2. Two independent axes

Do not conflate these:

```text
deviceId          — which ESP on the LAN (P7-D2, DHCP, pairing, run history)
actuatorKind      — how this ESP energizes its load (relay | hbridge | …)
```

| Axis | Example | Config / discovery |
|------|---------|-------------------|
| **`deviceId`** | `esp32-84CCA85C36B4` | Gateway `Device:Devices[]`; firmware `GET /api/status` |
| **`actuatorKind`** | `relay` vs `hbridge` | Firmware `GET /api/local/caps` (and/or status); future: gateway `GET /api/v1/devices` metadata |

A home install might run **one gateway** with **two devices**: relay SomEsp + motor SomEsp, each with its own `baseUrl`, `pin`, and programs.

---

## 3. What stays the same (reuse)

These layers should remain stable across actuator types:

| Layer | Pattern |
|-------|---------|
| **LAN HTTP shell** | `POST /api/local/unlock` → Bearer → `arm` → `POST /api/local/commands` → poll `GET /api/local/status` |
| **Command accept** | `commandKey` + `payloadJson`; immediate `accepted` + `correlationId`; completion via status / `resultJson` |
| **Safety gating** | Unlock + arm before motion; **abort** stops motion per actuator policy (see §7) |
| **Scheduled jobs** | Main app → `IDeviceGatewayClient` → LocalGateway `automatic/run` with **`deviceId`** → same coordinator single-flight **per device** |
| **Identifiers** | Persist **`deviceId`** on presets and run history — not IP |

Orchestration inside the automatic session FSM (end session rules, mode selection, busy/reject) should stay **shared**; only the **actuator backend** changes how “power” and “duration” map to GPIO/PWM.

---

## 4. What must diverge

### 4.1 Physical output

| Relay (today) | Motor (planned) |
|---------------|-----------------|
| GPIO pulse, fixed “on” during stroke | PWM duty + direction pins |
| Abort → open relay quickly | Abort → **brake vs coast** (TBD), PWM off, H-bridge dead time |
| “Power” ≈ stroke length / burst intensity semantics | “Power” likely **duty %** or speed setpoint — **not** 1:1 with `minimumStrokeMs` |

### 4.2 Payloads and DTOs

`AutomaticControlStateDto` is **relay-oriented** (`MinimumStrokeMs`, burst stroke counts, etc.). **Do not** grow it indefinitely with nullable motor fields.

**Direction (sketch):** a **common program envelope** (modes, end session, delays) plus an **actuator-specific block** selected by `actuatorKind`:

```json
{
  "automaticMode": "periodic",
  "endSessionMode": "strokeCount",
  "endSessionValue": 50,
  "actuatorKind": "hbridge",
  "motor": {
    "minimumDutyPercent": 20,
    "maximumDutyPercent": 80,
    "segmentMinSeconds": 5,
    "segmentMaxSeconds": 20
  }
}
```

Exact property names, units, and which modes apply to motor are **TBD** after bench tests. Relay devices would omit `motor` (or use a `relay` block with today’s stroke/burst fields). Serialization rules remain: **camelCase**, omit UI-only fields such as `running`.

### 4.3 Results and summaries

Relay `resultJson` uses stroke/burst vocabulary. Motor results should expose **parallel concepts** (e.g. segments completed, end reason) with **`actuatorKind`** on the result or inferred from device caps. SomNet-style **summary strings** for history may need a **motor-specific builder** alongside the relay path.

---

## 5. Architecture (target seams)

### 5.1 ESP firmware

```text
/api/local/*  →  CommandHandler  →  Automatic session FSM
                                        ↓
                              IActuatorDriver (new seam)
                                        ↓
                         RelayBackend     MotorBackend (H-bridge)
```

- **RelayBackend:** existing `relay_controller` timing (pulse, abort).
- **MotorBackend:** PWM, direction, ramp, dead time between direction changes; non-blocking `millis()`/`micros()` FSM same as relay.

**Packaging (TBD):**

| Option | When |
|--------|------|
| **`env:somesp-motor`** + `ACTUATOR_HBRIDGE=1` | Separate binary per product line; shared local API and FSM |
| **Single firmware + NVS/board profile** | One SKU per actuator type in the field |

Prefer **shared** `LocalCommandService` and **different backend** over forking the HTTP stack.

### 5.2 Gateway and LocalClient

| Component | Motor work |
|-----------|------------|
| **LocalGateway** | No motor timing; optional validation if host sends relay-shaped payload to `actuatorKind: hbridge` |
| **LocalClient** | Pass through JSON; parse `resultJson` with actuator-aware mappers when motor exists |
| **`DeviceGatewayConfiguredDeviceDto`** | Future: optional `ActuatorKind` (from gateway list or caps proxy) |

P7-D2 already supports **multiple `deviceId`s**; motor is **not** a gateway feature flag.

### 5.3 SomNet.Shared and main app

| Area | Approach |
|------|----------|
| **Shared DTOs** | Add `ActuatorKind` enum + motor parameter/result types when schema stabilizes; keep **job record snapshot** as JSON for forward compatibility |
| **TheSystem / scheduler** | Job definition: `deviceId` + preset; preset typed or tagged by actuator kind from discovery |
| **SomNet.API / UI / SignalR** | **Later** — same command dispatch pattern as hub if motor joins cloud; not required for LAN-only motor MVP |

---

## 6. Discovery (proposed)

Extend **`GET /api/local/caps`** (and document in `PROTOCOL.md` when implemented):

| Field | Purpose |
|-------|---------|
| `actuatorKind` | `relay` \| `hbridge` |
| `automaticModes` | Subset supported on this build |
| Limits | e.g. max duty, min/max segment duration, max continuous run |

Optional: gateway **`GET /api/v1/devices`** returns `actuatorKind` per configured `deviceId` by probing caps at startup or on demand (cache + TTL TBD).

Clients **must not** assume all devices accept `AutomaticControlStateDto` as-is after motor ships.

---

## 7. Safety and behavior — open questions

Lock these on hardware before publishing motor automatic modes:

| ID | Question | Options / notes |
|----|----------|-----------------|
| **MA-Q1** | **Abort** behavior | Brake (short both low/high sides policy) vs coast vs ramp-down |
| **MA-Q2** | **Direction change** | Mandatory dead time; whether automatic modes allow reverse |
| **MA-Q3** | **Power model** | Duty % vs timed on/off at fixed duty vs closed-loop speed (unlikely v1) |
| **MA-Q4** | **Arm/disarm** | Motor enable gated like relay + session accessory, or separate enable pin |
| **MA-Q5** | **Command keys** | Single `automatic-start` with discriminated payload **vs** `motor-automatic-start` (prefer one key + discriminator if validation stays clear) |
| **MA-Q6** | **Stop vs abort** | Same semantics as relay automatic-stop (graceful end vs immediate cut) |
| **MA-Q7** | **Thermal / stall** | Software limits only in v1? |

---

## 8. Phased roadmap (suggested)

Phases are **ordered**; exit criteria are intentionally modest for early work.

### Phase M0 — Design & caps (no automatic motor yet)

- [ ] Document motor manual commands and caps shape in `PROTOCOL.md` (draft).
- [ ] Bench: H-bridge wiring, PWM frequency, abort path verified on serial/log.
- **Exit:** Manual forward/reverse/PWM/stop from `/operate` or raw HTTP; `actuatorKind: hbridge` in caps.

### Phase M1 — LAN parity with relay shell

- [ ] `env:somesp-motor` (or profile) shares `/api/local/*` with relay SomEsp.
- [ ] Second `deviceId` in gateway `Device:Devices[]`; status + manual commands only.
- **Exit:** TheSystem or curl can unlock/arm two devices; relay unchanged; motor manual only.

### Phase M2 — One automatic mode on motor

- [ ] Motor parameter block in `automatic-start` payload; one mode (e.g. periodic segments).
- [ ] `resultJson` + gateway job completion path tested via LocalClient.
- **Exit:** Scheduled job runs motor program on `deviceId` B while relay `deviceId` A can run in parallel (P7-D2).

### Phase M3 — Shared .NET model

- [ ] `ActuatorKind` + motor DTOs in `SomNet.Shared`; job snapshot stores full JSON.
- [ ] Optional gateway list enrichment (`actuatorKind`).
- **Exit:** Presets in main app distinguish relay vs motor without hardcoding IP.

### Phase M4 — Cloud / UI (optional)

- [ ] Hub commands and UI controls if motor joins paired hub firmware.
- **Exit:** Defined per product; not blocking LAN MVP.

---

## 9. Decisions log (TBD)

| ID | Topic | Decision | Date |
|----|-------|----------|------|
| **MA-D1** | Actuator discovery field name | `actuatorKind` in caps | — |
| **MA-D2** | Payload strategy | Discriminated block vs separate DTO types in .NET | — |
| **MA-D3** | Firmware packaging | `somesp-motor` env vs NVS profile | — |
| **MA-D4** | Abort policy | — | — |
| **MA-D5** | Reuse `automatic-start` key | — | — |

Update this table when choices are made; move settled items to firmware `config.h` / PROTOCOL and Shared enums.

---

## 10. Why this doc exists now

Multi-device gateway work (P7-D2) solves **routing and concurrency across ESPs**. Motor support solves **what each ESP executes**. Capturing the split early avoids painting the network stack into a relay-only corner (e.g. overloading `AutomaticControlStateDto` or assuming one payload fits all devices on `Device:Devices[]`).

When motor firmware starts, implement **M0–M1** first and link concrete PRs/checklists here or in a follow-on `31-Motor-Phase-M0-Checklist.md` if the work grows.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-10-25 | Initial early-design stub |
