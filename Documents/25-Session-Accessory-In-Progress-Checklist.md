# Session accessory & Session in Progress (P16)

**Status:** **Signed off** (bench S1–S8, 2026-09-20) — firmware **`0.15.0-session-accessory`**. **Pi / video edge** may resume ([Phase 7](./20-Video-Phase-7-Pi-Production-Checklist.md)).

**Goal:** Dom **Session in Progress** slide switch drives server session lifecycle and ESP32 **`session-accessory`** GPIO (GPIO32). Sub **double-click** (`ReportButtonEvent`) plus device **Ready** form a **series gate** before the switch can turn on. **Start / Stroke / Burst** are blocked until the switch is **ON**. The switch stays **disabled** while manual or automatic work is in flight until idle or **Abort**.

| Related | Link |
|---------|------|
| Button ready (double-click) | [23 — Device button clicks](./23-Device-Button-Clicks-Checklist.md) |
| Session lifecycle | [07 — Session & History](./07-Session-And-History.md) |
| Multi-tab | [12 — UI Multi-Tab Sync](./12-UI-Multi-Tab-Sync-Checklist.md) |
| ESP32 plan | [09 — ESP32 Device Plan](./09-ESP32-Device-Plan.md) |

---

## Locked decisions (P16-D*)

| ID | Decision |
|----|----------|
| **P16-D1** | Sub must **double-click** (successful `ReportButtonEvent` → UI) **and** system **Ready** before **Session in Progress** can turn **ON**. |
| **P16-D2** | **Start**, **Stroke**, **Burst** blocked in UI until switch **ON**; firmware rejects `stroke` / `burst` / `automatic-start` when accessory **OFF**. |
| **P16-D3** | Switch **disabled** while stroke/burst/start pending, automatic **running**, or cooperative stop in progress; **Abort** allowed. Dom turns switch **OFF** manually when satisfied (no auto-off on device complete). |
| **P16-D4** | **GPIO32** (`PIN_SESSION_ACCESSORY` in `boardDefs.h`); **active-high** like relay; **fail-safe OFF** on hub/Wi‑Fi transport loss. |
| **P16-D5** | Tab-sync broadcasts **session in progress** like `running` / `session`. |
| **P16-D6** | Hardware command key **`session-accessory`**, payload `{ "enabled": true \| false }`. Serial prefix **`[ACCESSORY]`**. |
| **P16-D7** | Each **OFF→ON** creates a **new** server session id. **Manual ↔ automatic** while switch stays **ON** keeps the **same** session id (local + optional PATCH mode). |
| **P16-D8** | **Pi / video production (Phase 7+)** pushed back until P16 sign-off. |
| **P16-D9** | Session in Progress **OFF** with **no strokes** and **no Automatic Start** → **DELETE** server row (not end with summary). |
| **P16-D10** | Sub **double-click ack** persists across Session in Progress **OFF→ON** (per Sub, `sessionStorage`); cleared only on **Sub change**. |

---

## Resolved questions

| ID | Resolution |
|----|------------|
| **P16-Q1** | Sub ready **does not expire** by time; ack persists per **P16-D10** until **Sub change**. |

---

## Implementation checklist

### Shared / API

- [x] `HardwareCommandKeys.SessionAccessory` = `session-accessory`
- [x] `HardwareCommandPayloadValidator` — `enabled` boolean required
- [x] `UpdateSessionRequestDto` optional `Mode` for mode switch without new row
- [x] `DELETE /api/sessions/{id}` discard in-progress placeholder (P16-D9)

### Firmware (`0.15.0-session-accessory`)

- [x] `PIN_SESSION_ACCESSORY` = 32, `SESSION_ACCESSORY_ACTIVE_HIGH`
- [x] `session_accessory_controller` — set/release, `[ACCESSORY]` logs
- [x] `session-accessory` command; gate stroke/burst/automatic-start
- [x] Release on `SignalRClient::onTransportLost` and Wi‑Fi disconnect poll

### UI

- [x] `SiteUserReadyProvider` — sub present ack for selected Sub (+ `subPresentAckStorage`)
- [x] `SessionAccessoryProvider` + **Session in Progress** slide switch (header)
- [x] Session start/end on OFF→ON / ON→OFF only; `sessionStorage` hint for refresh
- [x] Gate Manual / Automatic controls; mode switch stops device but keeps session when switch ON
- [x] Tab-sync message `session-accessory`
- [x] Session rehydration only when switch in progress (storage)
- [x] History lists **session id** (`sess-…`) for bench / support (post S7)

### Docs / bench

- [ ] Update [07](./07-Session-And-History.md), [09](./09-ESP32-Device-Plan.md), [User-Guide](./User-Guide.md), [Hardware User Guide](./Hardware-User-Guide.md) — follow-up
- [x] Bench tests S1–S8 (below)

---

## Bench tests (S*) — **all pass 2026-09-20**

| ID | Pass criteria | Result |
|----|---------------|--------|
| **S1** | Ready + double-click → switch ON → `[ACCESSORY] ON`, GPIO high, new session | ☑ |
| **S2** | OFF with no activity → `[ACCESSORY] OFF`, row **discarded** (no History clutter) | ☑ (re-test after P16-D9) |
| **S3** | Controls blocked when switch OFF | ☑ |
| **S4** | Stroke when ON; blocked after OFF | ☑ |
| **S5** | Switch locked while automatic running; ack persists OFF→ON | ☑ (re-test) |
| **S6** | Hub/Wi‑Fi drop → safety release OFF | ☑ |
| **S7** | Mode switch with switch ON → same session id (verified server-side; UI id now in History) | ☑ |
| **S8** | Second tab follows slide switch | ☑ |
