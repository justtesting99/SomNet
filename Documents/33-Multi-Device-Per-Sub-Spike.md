# Spike X-6 — Multi-device per Sub

**Operator session / accessory:** **V2 rules** in [34 — Operator session & accessory V2](./34-Operator-Session-And-Accessory-V2-Rules.md) supersede P16 (V1) and older rows in this doc (e.g. Q1 relay-only accessory). Implement and review against **V2**, not V1.

**Status:** **Spike signed off** (2026-10-26) — implement **X-6.1–X-6.6** before M1b / M2 / M3 expansion that depends on stable multi-device host patterns. **Bench:** same-Sub relay+motor exercised informally; formal **M1/X-4** via [32 §2.4](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md).

**Problem:** PK is now `(Dom, Sub, DeviceId)` in tree; **one Sub, many devices** is the target. Dual-Sub ([32 §2.2 X-6i](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md)) remains for Sub-isolation tests.

| Related | Link |
|---------|------|
| Remit & gap | [31 §12](./31-Motor-Actuator-Device-Design.md) |
| Motor plan gate | [32 §2 X-6](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md) |
| DB today | [04 — Schema §SubDeviceRegistrations](./04-Database-Schema.md) |
| Gateway routing precedent | [29 §P7-D2](./29-Device-Local-Gateway-Implementation-Plan.md) |
| Interim dual-Sub UI | [32 §2.2 X-6i](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md) |

---

## 1. Spike goals

| In scope | Out of scope (later spikes) |
|----------|-----------------------------|
| Agree **identity model** (Sub session vs physical `deviceId`) | Synchronized “one program drives two motors” choreography |
| Agree **routing** (hub, API, UI, gateway alignment) | New actuator firmware (linear actuator) beyond enum + routing |
| Agree **per-device independence** (routing, UI non-lockout, gateway-ready FSMs) | Gateway **super-session** implementation (M3); UI “Start all” choreography |
| **Phased delivery** with testable milestones | Full migration of every relay UI path in one PR |
| **Open questions** with default recommendations | Implementing the spike in code (follow-on epics) |

**Exit:** Stakeholders sign **§8 Spike sign-off**; [32](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md) updated with X-6 implementation slices; M1b/M2 explicitly **unblocked** or **scoped**.

### 1.1 Product vision — why multi-device matters

| Layer | What we optimize for |
|-------|----------------------|
| **Hub / API / standalone** | **Correct routing** (`deviceId`), **per-device FSM** semantics, **no false coupling** between devices. A human manually flipping tabs and start/stopping many devices at once is **unusual** — we do **not** design elaborate “at the same time” product rules for that path. |
| **Gateway / TheSystem (future)** | **Primary driver** for concurrent multi-device runs: compiles payloads, **starts/updates/tracks** many `deviceId`s, handles overlapping events. Devices must **tolerate** start/stop/update while peers are active — that is the real concurrency requirement. |
| **SomNet.UI** | **Per-device** panels/tabs: if controls exist for a device, the operator is **not locked out** of changing parameters or start/stop on **that** device (while viewing that context). No global mutex across the roster. Multi-tab sync keys state by **`(subTarget, deviceId)`**. |

**Session vs accessory:** A **Sub session** (scene, video, history) must **not** be **blocked** when **no relay** (hence no hub `session-accessory`) is on the roster — e.g. motor-only Sub (§4.3.2, Q8).

---

## 2. Use cases (operator truth)

Priority reflects your bench/product notes.

| ID | Scenario | Same Sub session? | Concurrent motion? | Frequency |
|----|----------|-------------------|--------------------|-----------|
| **UC-1** | One **relay** ESP on Sub | Yes | N/A (single device) | Baseline (today, per Sub) |
| **UC-2** | One **motor** ESP on Sub | Yes | N/A | Baseline (motor M1) |
| **UC-3** | **Relay + motor** on same Sub | Yes (one roster) | **Physically** often impractical at once; **operationally** each device may run its own FSM — **no v1 UI/API lockout** | Common roster; concurrent use rare today, possible later via gateway |
| **UC-4** | **Two motor** ESPs on Sub; **both** automatic during one Sub **scene** / history window | Yes | **Yes** — **independent** programs; optional **Start both** later | **Common** (primary multi-device driver) |
| **UC-5** | **Relay + linear actuator** (future kind) | Yes | Same pattern as UC-3 — separate device UIs; accessory/rules per kind | Future |

**Implication:** **One Sub identity** + **device roster**. UC-4 matters for **gateway-orchestrated** dual-motor runs and for **honest per-device UI** — not for expecting operators to juggle many tabs. See **§1.1**.

---

## 3. Current system (constraints)

### 3.1 Data & pairing

- `SubDeviceRegistrations`: **one row per Sub**; re-pair **replaces** `deviceId`, token, `actuatorKind`.
- `DomSubSettings`: **one JSON blob per Sub** (`manual` / `automatic` / `motorAutomatic`) — **not** per `deviceId`.
- Sessions (`SessionHistoryEntry`): **one active row per Sub** (`DomTarget` + `SubTarget`); **no** `deviceId` on session.

### 3.2 Hub & commands

- Operator API: `POST …/hardware-command` with **`subTarget` only** → dispatcher loads **the** registration for that Sub.
- SignalR: command sent to hub group `Paired(dom, sub)`; message includes **`deviceId`** + **`accessToken`** for **one** registration.
- **Connection registry:** key = `(dom, sub)` → **one** `connectionId` (last paired device wins).
- **Firmware:** already rejects commands when `deviceId` or `accessToken` does not match **this** unit — so accidental multicast to a group is **safe but noisy**, not dangerous.

### 3.3 UI (after X-6i)

- State is scoped to **selected Sub**, not **selected device** — correct for **two Subs / two users**, insufficient for **two motors / one Sub**.

### 3.4 Gateway (P7-D2)

- Already routes by **`deviceId`** with per-device lock (409 on same device).
- Does **not** fix hub Sub pairing or SomNet.UI session model.

---

## 4. Recommended target model

### 4.1 Concepts

```text
Dom ── assigns ──► Sub (session identity: Slv66)
                      │
                      ├── Session in progress (0..1)     ← operator “scene” / history row
                      ├── Pairing settings (per Sub)     ← evolve to per-device or slotted
                      └── Device roster (1..N)
                            ├── deviceId A  actuatorKind relay
                            ├── deviceId B  actuatorKind hbridge   label "Motor left"
                            └── deviceId C  actuatorKind hbridge   label "Motor right"
```

| Concept | Rule |
|---------|------|
| **Sub** | Who the session is **for** (identity, video, notifications, history filter). **Unchanged** as the primary selector in the header. |
| **Device** | Physical ESP (`deviceId`), **one** `actuatorKind` in NVS, **one** hub connection, **one** token row. |
| **Session** | **One in-progress session per Sub** (recommend **keep**) for **scene** / video / history. Not tied to every device’s motion state. |
| **Motion** | **Per device** FSM; UC-4 = two independent motor tracks; payloads + acks per `deviceId`. |
| **Accessory (hub)** | Optional **`session-accessory`** per **selected** `deviceId` (§4.3.1). Independent of motion. |

### 4.2 Registration & tokens

**Schema (recommended):**

- Change PK to **`(DomTarget, SubName, DeviceId)`** *or* surrogate `RegistrationId` with unique `(Dom, Sub, DeviceId)`.
- **Pair** = **upsert** row for that `deviceId`; **revoke** = revoke **one** device (add `DELETE …?deviceId=`).
- Each row: `AccessToken`, `ActuatorKind`, `DisplayLabel` (optional), `SortOrder` / `Slot` (optional for UI).

**JWT:** Keep claims `device_id`, `sub_target`, `dom_target` — already device-specific.

**Firmware:** No change to “one pairing per ESP” NVS model.

### 4.3 Command routing (hub)

Align with **P7-D2**: **`deviceId` is always required** on operator → API commands (query or body) — **even when the Sub has only one device** (Q2, 2026-10-26). Keeps routing, live state, and **history** consistent; no implicit single-device shortcut.

| Step | Behavior |
|------|----------|
| Resolve registration | `(dom, sub, deviceId)` |
| Validate payload | `actuatorKind` on **that** row (existing validator) |
| Deliver | **Unicast** to `connectionId` for that `deviceId` (extend registry: `deviceId` → connection, plus index `(dom,sub)` → list) |
| Ack | Unchanged correlation id; registry already per-command |

**UI:** Every hardware action is issued in context of a **selected `deviceId`** (explicit picker or panel binding). Session/history child rows (§4.6) always store `deviceId`.

#### 4.3.1 Accessory On/Off (`session-accessory`) — **revised 2026-10-27**

**Naming:** UI and operator docs use **Accessory** (on/off), not “relay lock.” Same hub command: `session-accessory`.

**Unified rules (relay + motor boards):**

| Rule | Relay board | Motor board |
|------|-------------|-------------|
| Operator **Accessory** toggle in header | Yes — targets **selected** `deviceId` | Yes — same toggle, same prerequisites |
| Requires **Scene session** on | Yes | Yes |
| Stored / tab-synced per | `(subTarget, deviceId)` | `(subTarget, deviceId)` |
| Motion gated on accessory | **No** — strokes / automatic run only need **Scene session** (+ device ready) | **No** — same rule set |
| Accessory use | **Voluntary** — operator turns on only when external output is needed | **Voluntary** — GPIO may be unwired on some builds |

**Routing:** `session-accessory` is sent to whichever `deviceId` the operator selected (unicast). Both board types **may** implement the command even if a given motor build does not wire accessory output yet — keeps one product rule set.

**Motor program auxiliary outputs** (future): additional GPIO timed with a motor FSM remain separate from this operator **Accessory** line; they do not replace the shared toggle above.

#### 4.3.2 Session without relay accessory (**agreed 2026-10-26**, Q8)

| Roster | Sub session (video, history, server row) | `session-accessory` |
|--------|------------------------------------------|---------------------|
| **Any roster** | Scene / motion **not** blocked when Accessory is off | Only when operator enables **Accessory** for that `deviceId` |

### 4.4 Pairing settings

| Approach | Pros | Cons |
|----------|------|------|
| **A. Per-device settings table** (`DomSubDeviceSettings`) | Clean for UC-4 (different duty on each motor) | Migration + UI work |
| **B. Slotted JSON** (`motors[]` in pairing blob) | One fetch per Sub | Slots ≠ roving `deviceId` unless remapped |
| **C. Shared motor settings + “mirror”** | Fastest for UC-4 “same program both motors” | Fails if motors need different parameters |

**Recommendation:**

- **X-6 MVP (UC-4):** **A** or **B with stable `slot` on registration** — each motor device has its own `motorAutomatic` (or slot index in JSON).
- **UC-3:** Relay and motor **share** Sub-level `manual` / relay `automatic` where kinds differ; UI shows **only** panels for **selected** or **active** device.

### 4.5 UI

| Area | Change |
|------|--------|
| **Hardware** | List **all** devices on Sub; pair/add/revoke **per** `deviceId`. |
| **Controls** | **Separate panels per `deviceId`** — relay (manual/automatic + Session in Progress) vs each motor (motor automatic, independent Start/Stop). |
| **Session** | Sub-level **Scene session** gates motion/history (§4.3.2). **Accessory** is optional and per-device (§4.3.1). |
| **State** | Replace X-6i scoping with **`(subTarget, deviceId)`** for `activeSession` automatic tracks, `running`, tab-sync. |
| **System status** | Ready = **selected device** ready (or worst-of roster — **recommend selected device**). |

### 4.6 Session history & `resultJson`

| Option | Description |
|--------|-------------|
| **H1 (MVP)** | One session row; summary text lists **per-device** automatic results (append-only). |
| **H2** | Child table `SessionDeviceRuns` (`sessionId`, `deviceId`, `resultJson`, …) — better for gateway/TheSystem. |

**Recommendation:** Spike implementation plan uses **H2** in schema design, **H1** acceptable for first UI slice if needed.

### 4.7 Device independence (host rules, **agreed 2026-10-26**)

Each ESP runs its **own FSM**. The hub **routes one payload → one `deviceId`** and **monitors that device’s** ack / `resultJson`. **No cross-device mutex** in API v1.

| Rule | Why | Enforcement |
|------|-----|-------------|
| **R1** | One automatic program per physical unit | Device FSM; optional hub 409 per `deviceId` |
| **R2** | Gateway may start/update **many** devices in one scene | Devices must accept overlapping commands; registry + unicast per §4.3 |
| **R3** | UI shows per-device controls | **Do not lock** parameter edits or start/stop on device B because device A is running |
| **R4** | Relay accessory is optional on roster | Session/motor not blocked without relay (§4.3.2) |
| **R5** | Future linear actuator | Same as motor — program-owned I/O, own panel |

Human-driven “juggle everything at once” is **out of scope** as a product scenario; rules above keep the **platform honest** for **gateway** and **per-tab UI**.

### 4.8 Gateway orchestration (primary multi-device story)

**Gateway / TheSystem** is expected to **compile** multi-device plans, **fan out** start/update/stop payloads, and **track** all devices — this is where concurrent multi-device behavior is **most likely**, not from an operator rapidly switching UI tabs.

```text
Gateway / super-session (target)     SomNet.UI + hub (X-6)
────────────────────────────────     ───────────────────────
Build N payloads                     Operator on device tab → 1 command + deviceId
Dispatch / track all FSMs            Same routing; no global UI lockout
Handle partial failure per device    Per-device ack + history row
```

X-6 delivers **routing + per-device state** so gateway work (and [32](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md) M3) can rely on stable semantics. Coordinated “Start all motors” in the **web UI** remains **optional** later.

---

## 5. Proposed implementation slices (after spike sign-off)

Treat as **X-6** sub-deliverables (order matters).

| Slice | Deliverable | Unlocks |
|-------|-------------|---------|
| **X-6.1** | DB migration + pair/revoke/list **per device**; registry multi-connection | Two ESPs paired to **same** Sub |
| **X-6.2** | API/UI `deviceId` on **all** hardware commands; hub unicast | Correct routing |
| **X-6.3** | UI device roster + per-motor controls; settings per device or slot | **Done** 2026-10-27 — `DomSubDeviceSettings`; `/api/settings?deviceId=`; Options reload on picker |
| **X-6.4** | Session/history per-device results (H1 or H2) | Auditable dual-motor sessions |
| **X-6.5** | V2 accessory model (voluntary, per `deviceId`, motion decoupled) | In tree — verify on **Run A/B** ([34](./34-Operator-Session-And-Accessory-V2-Rules.md) §3.2) |
| **X-6.6** | Tab-sync + session providers keyed by `(sub, deviceId)` | Multi-tab parity |

**Firmware / standalone / gateway:** No new motor features required for X-6.1–X-6.2 beyond hub delivery assumptions already met (`deviceId` filter). **M2** should copy the **same `deviceId` routing** semantics in local API only after X-6.2 is stable.

---

## 6. Alternatives considered

| Alternative | Why not (for remit) |
|-------------|---------------------|
| **Keep using two Subs** | Violates session identity; does not scale to two motors on one Sub |
| **Virtual Sub per device** (`Slv66-m1`) | Pollutes Dom/Sub assignment; breaks notifications and history |
| **One ESP, two actuators** | Contradicts MA-D3 / one backend per unit |
| **Broadcast hub group + shared token** | Breaks per-device revocation and actuator validation |

---

## 7. Decisions & open questions

| # | Question | Status | Decision |
|---|----------|--------|----------|
| **Q1** | Session accessory scope | **Superseded by V2** | Per [34](./34-Operator-Session-And-Accessory-V2-Rules.md): `session-accessory` per selected `deviceId`; voluntary; not motion gate. *(2026-10-26 row was relay-only — historical.)* |
| **Q2** | `deviceId` when Sub has one device? | **Agreed** | **Always required** on commands and in history — no omit-when-count=1 shortcut (standardized data end-to-end) |
| **Q3** | Two motors: same program or independent? | **Agreed** | **Independent** start/stop per motor; **Start both** optional later |
| **Q4** | Relay + motor same time | **Agreed** | **No v1 UI/API lockout**; separate device UIs; physical constraint is operator’s; gateway **super-session** later (§4.8) |
| **Q5** | Max devices per Sub? | **Agreed** | **Ceiling 8** — aligns with optional future **3 strap pins → 3-bit `actuatorProfileId`** ([31 MA-D13](./31-Motor-Actuator-Device-Design.md)); straps **not required** for X-6; no arbitrary lower UI cap |
| **Q6** | Multiple relays on one Sub? | **Agreed** | **Not currently** — at most **one relay** per Sub in v1 |
| **Q7** | Migrate existing single registration rows? | **Agreed** | **Yes** — existing rows map 1:1; same `deviceId`; PK becomes `(Dom, Sub, DeviceId)` |
| **Q8** | Session when no relay / no accessory? | **Agreed** | **Do not block** session or motor path; `session-accessory` only when relay exists (§4.3.2) |
| **Q9** | Why care about “at the same time”? | **Agreed** | **Gateway** orchestration + **per-device UI** not locked out — not human tab-juggling rules (§1.1, §4.8) |

---

## 8. Spike sign-off

| Field | Value |
|-------|--------|
| **Date** | 2026-10-26 |
| **Reviewed by** | Operator (chat) |
| **Agreed model** | ☑ §4.1–4.8 |
| **Agreed slices** | ☑ §5 order (X-6.1 → X-6.6) |
| **Resolved open questions** | ☑ **Q1–Q9** (see §7) |
| **M1b / M2** | ☑ **Unblocked for implementation planning** — build X-6 slices before expanding motor modes (M1b) or standalone parity (M2) |

---

## 9. Document history

| Date | Change |
|------|--------|
| 2026-10-26 | Initial spike — UC-1–UC-5, target model, X-6.1–X-6.6 slices, gates M1b/M2 |
| 2026-10-26 | Operator decisions: Q1 relay-only session accessory; Q3 independent motors + Start both later; Q4 no host exclusivity; §4.8 super-session future |
| 2026-10-26 | Q2 always `deviceId`; Q5 max 8 (MA-D13 ceiling, straps optional); Q6 one relay/Sub; Q7 migration yes — **§8 sign-off complete** |
| 2026-10-26 | §1.1 vision — gateway-driven concurrency; UI per-device non-lockout; Q8 session not blocked without accessory; Q9 |
| 2026-10-27 | §4.3.1 — **Accessory** naming; same accessory rules for relay + motor boards; per-`deviceId` `session-accessory` (supersedes relay-only routing note) |
| 2026-10-27 | §4.3.1 — Accessory **voluntary**; motion **not** gated on accessory (relay or motor) |
| 2026-10-27 | [32 §2.4](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md) — operator Run A (X-4) / Run B (M1) sign-off runs |
