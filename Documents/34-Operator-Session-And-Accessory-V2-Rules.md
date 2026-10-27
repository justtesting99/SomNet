# Operator session & accessory — V2 rules (canonical)

**Status:** **Norm for new work** (2026-10-27). **Supersedes** P16 / single-device operator assumptions for session, accessory, and multi-device behavior.

| Related | Link |
|---------|------|
| Multi-device spike (routing, X-6) | [33 — Multi-device per Sub](./33-Multi-Device-Per-Sub-Spike.md) |
| **Shared vs per-device audit** | [35 — Device independence audit](./35-Device-Independence-Audit.md) |
| Motor / X-6 implementation | [32 — Motor plan](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md) |
| **Historical** P16 sign-off (V1) | [25 — Session accessory checklist](./25-Session-Accessory-In-Progress-Checklist.md) |
| Doc hygiene | [08 — Development Guide § Documentation maintenance](./08-Development-Guide.md#documentation-maintenance-recurring) |

---

## 1. How to use this document

| Audience | Rule |
|----------|------|
| **Implementers** (UI, API, firmware, docs) | When changing **scene session**, **accessory**, **multi-device** routing, or **command gating**, follow **§3 V2** only. Do **not** reintroduce **§2 V1** behaviors “for compatibility” unless the task is explicitly **legacy firmware** support or **historical checklist** preservation. |
| **Reviewers** | If a PR restores V1 coupling (e.g. motion blocked on accessory, relay-only accessory routing, “relay lock” as a gate), reject or redirect to V2 unless scoped as a deliberate V1 maintenance fix on old images. |
| **Readers of old checklists** | P16 ([25](./25-Session-Accessory-In-Progress-Checklist.md)), early [33](./33-Multi-Device-Per-Sub-Spike.md) Q1/MA-D22 rows, and [31](./31-Motor-Actuator-Device-Design.md) **MA-D22** describe **V1** or superseded spike text — **not** the current operator norm. |

**Naming:** Prefer **Scene session** and **Accessory** in UI and new docs. Avoid **Relay lock**, **Session in Progress** (as the only label), and “accessory required for stroke” unless documenting V1 history.

---

## 2. V1 (historical — do not extend)

**Era:** P16 sign-off (2026-09-20), single relay ESP per Sub, firmware **`0.15.0-session-accessory`** class behavior.

| Topic | V1 behavior |
|-------|-------------|
| **Session UI** | One **Session in Progress** switch; tightly coupled to relay **session-accessory** mental model |
| **Accessory scope** | Hub **`session-accessory`** aimed at **relay** device; “lock” wording common |
| **Motion vs accessory** | **Start / Stroke / Burst** blocked until session accessory **ON** (UI + relay firmware reject when off) |
| **Multi-device** | One `deviceId` per Sub in DB; bench used two Subs |
| **Ready ack** | Sub-level double-click before session switch |

V1 remains valid as **what we shipped and signed off** in [25](./25-Session-Accessory-In-Progress-Checklist.md). **Do not tweak V1 checklists** to match V2; add a banner pointing here instead.

---

## 3. V2 (canonical operator model)

V2 is the **target norm** for SomNet hub + web UI + unified ESP firmware on the **multi-device** path (X-6). Some items are **fully implemented**; others are **agreed rules** still being built (noted below).

### 3.1 Concepts

| Concept | V2 rule |
|---------|---------|
| **Sub** | Identity for video, notifications, roster — primary header selector |
| **Device** | Physical ESP (`deviceId`), one `actuatorKind`, one hub connection; **`deviceId` required** on operator commands |
| **Scene session** | Operator scene / server session / video context — **one per device** (`deviceId` on server row + UI storage) |
| **Accessory** | Optional **`session-accessory`** GPIO (or equivalent) — **voluntary**; operator turns **Accessory** on only when the install uses that output |
| **Motion** | Relay strokes / automatic and motor run — gated by **Scene session** (+ device online / ready rules), **not** by Accessory |

### 3.2 Accessory (unified relay + motor boards)

| Rule | Detail |
|------|--------|
| **Same rules both board types** | Any registered device **may** receive `session-accessory`; unwired GPIO on a motor build is OK |
| **Per device** | State stored and tab-synced per **`(subTarget, deviceId)`** |
| **Enable Accessory** | Requires **Scene session ON** (do not energize accessory outside a scene) |
| **Disable Accessory** | Does **not** by itself stop motion; ending **Scene** may best-effort turn accessory off on roster devices |
| **Motion** | **Never** requires Accessory ON (UI and firmware must not reject motion for “session accessory off”) |

### 3.3 Multi-device

| Rule | Detail |
|------|--------|
| **Routing** | Unicast commands to selected **`deviceId`** |
| **Concurrency** | No v1 UI/API lockout between relay and motor on same Sub; each device FSM independent |
| **UI** | Device picker; panels follow selected device |

### 3.4 Ready / safety

| Rule | Detail | Status |
|------|--------|--------|
| Double-click before scene/accessory | Per **`deviceId`** on the selected device | **Yes** — hub `ButtonEventReceived` includes `deviceId` |
| Fail-safe accessory off on transport loss | Firmware de-energize on hub/Wi‑Fi loss | **Retained** from P16 hardware safety |

### 3.5 Device-isolated operator runtime (no shared relay state)

| Rule | Detail |
|------|--------|
| **Automatic `running`** | Authoritative per **`(subTarget, deviceId, relay\|motor)`** — in-memory map + per-device refresh hint; **never** one global `sessionStorage` key for the whole app |
| **Settings UI** | `OptionsProvider` loads/saves **one selected device** at a time; on device switch, cache running + flush debounced save for the previous device |
| **Hub `automatic-session-complete`** | Must include **`deviceId`** on operator `CommandAcknowledged`; listener finalizes **that device’s** session and clears **that device’s** running only |
| **Mode switch / sign-out** | Stop cooperative automatic using **selected device** actuator plane (relay vs motor), not `settings.automatic` only |
| **Anti-pattern** | Reading `settings.automatic.running` when the selected device is **motor**, or clearing motor running via relay-only hub paths |
| **Control panel** | Dashboard operations column shows the **header Focus** `deviceId` only (`DeviceOperationsPanel`). Each block has Scene/Accessory + per-device manual/automatic mode + motion controls. Video/status follow the same Focus device |
| **Operation mode** | **Per `deviceId`** (manual vs automatic). **No** global “choose mode” gate. Relay and motor each support **manual** and **automatic** (`MotorManualControls` / `MotorAutomaticControls`). One device may run automatic while another is in manual |

---

## 4. V1 → V2 mapping (migration cheat sheet)

| V1 term / behavior | V2 replacement |
|--------------------|----------------|
| Session in Progress (single switch) | **Scene session** (+ separate **Accessory**) |
| Relay lock | **Accessory** |
| Accessory ON required for stroke/Start | **Removed** — Scene session (+ readiness) only |
| `session-accessory` → relay only | `session-accessory` → **selected `deviceId`** |
| MA-D22 “relay only session accessory” | **Superseded** — see §3.2 |

---

## 5. Implementation alignment (living)

Update this table when milestones land; it is a **guide**, not a second checklist.

| Area | V2 aligned? | Notes |
|------|-------------|--------|
| UI header | **Yes** | Scene session + Accessory; per-device accessory storage |
| Relay manual/automatic gating | **Yes** | Scene session; no accessory gate |
| Motor motion gating | **Yes** | Independent of accessory |
| Relay firmware motion gate | **Yes** | Accessory reject removed from `command_handler` |
| Hub `deviceId` on commands | **Yes** | X-6.1–X-6.2 |
| Per-device scene session | **Yes** | API `DeviceId`, UI storage + header per selected device |
| Per-device ready ack | **Yes** | `sessionStorage` per `(sub, deviceId)`; double-click selects device |
| Per-device automatic `running` + hub complete | **Yes** | Map + per-device hint; API stamps `deviceId` on forwarded acks |
| Per-device pairing settings (X-6.3) | **Yes** | `DomSubDeviceSettings` |
| Doc [06](./06-SignalR-And-Hardware.md) / User Guide | **Partial** | Sweep when operator docs next edited; note `HardwareCommandAckDto.deviceId` |
| Motor pattern graph (hub UI) | **Yes** | [31 §13](./31-Motor-Actuator-Device-Design.md), [03 § Motor pattern graph](./03-Frontend-Architecture.md#motor-pattern-graph-scope); segment ack `motor-automatic-segment` |

---

## 6. Document history

| Date | Change |
|------|--------|
| 2026-10-27 | Initial V2 norm — supersedes P16 operator coupling and relay-only accessory spike text for **new** work |
| 2026-10-27 | Operator confirmed §3 summary (accessory optional; scene gates motion; unified accessory per `deviceId`; multi-device no lockout; V2-only forward work) |
| 2026-10-27 | Per-device **scene session** — API/UI implementation started |
| 2026-10-27 | Per-device **ready ack** (double-click) |
| 2026-10-27 | §3.5 device-isolated automatic running + hub `deviceId` on session complete |
| 2026-10-27 | §3.5 control panel ↔ Focus device; motor manual + pattern graph alignment row in §5 |
