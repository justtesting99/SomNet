# SomNet UI — Phase 8 Checklist

**SomNet UI pairing polish and command integration** — wire manual **stroke** and **abort** from the React app to `POST /api/devices/commands`; add **`resultJson`** end-to-end; relocate pairing from dev-only Options placement; optional **unpaired devices** list and **Dom all-Subs** hardware admin.

**Parent plan:** [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §4.1, §9, §10 Phase 8  
**Protocol reference:** [`SomNet.Device/docs/PROTOCOL.md`](../SomNet.Device/docs/PROTOCOL.md) §6–7  
**Prior phase:** [09-ESP32-Phase-7-Checklist.md](./09-ESP32-Phase-7-Checklist.md) (**Signed off** 2026-09-06)  
**Status:** **Signed off** — 2026-09-06 (`esp32-84CCA85C36B4` / Slv66, firmware `0.8.10-phase8`)  
**Target output:** Dom pairs and strokes from **polished** SomNet UI (not Swagger); session history reflects **device ack** + `resultJson`; abort/busy E2E from UI — **met**

---

## Phase 8 at a glance

| Item | Value |
|------|--------|
| **Goal** | Production operator UX — real hardware commands + authoritative session records + pairing admin |
| **Duration** | 3–5 days |
| **Hardware scope** | Same DevKit (`esp32-84CCA85C36B4` / `Slv66`); relay on **D4** |
| **Software scope** | `SomNet.Shared` DTOs, `SomNet.API` dispatcher + new endpoint, `SomNet.Device` ack wire, `SomNet.UI` commands + pairing dialog |
| **Explicitly out of scope** | Burst/automatic **firmware** modes (Phase 9), OTA, certificate pinning policy (§15), QR scan (optional later), two-phase ack API |
| **Blocks** | Phase 9 burst/automatic benefits from real UI command path and `resultJson` plumbing |

Update **Status** above and check boxes below as work completes. When Phase 8 is done, update [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 Phase 8.

---

## Prerequisites

### Completed upstream

- [x] Phase 7 **Signed off** — [09-ESP32-Phase-7-Checklist.md](./09-ESP32-Phase-7-Checklist.md)
- [x] Device **paired** + hub **connected** after soak
- [x] Swagger `POST /api/devices/commands` **stroke** happy path verified (Phases 5–6)
- [x] Firmware **`abort`** + busy reject implemented (E2E deferred — this phase)
- [x] Firmware builds **`resultJson`** locally (serial only today)
- [x] Review plan §9 *Source-of-truth* — target UI flow diagram
- [x] Review plan §4.1 *Pending devices list* — `GET /api/devices/unpaired` shape
- [x] Review current UI stubs — replaced `hardwareCommandAck.ts`, `SessionProvider`, `DevicePairingPanel` → Hardware dialog

### Developer environment

- [x] SomNet API + UI running (local LAN)
- [x] ESP32 on same LAN; serial 115200 baud
- [x] Paired test Sub (**`Slv66`**)
- [x] Dom JWT login in browser; Swagger available for regression

### Current state (entering Phase 8)

| Layer | Today | Phase 8 change |
|-------|-------|----------------|
| **Firmware `AckCommand`** | `correlationId`, `success`, `message` only | Add **`resultJson`** on wire |
| **`HardwareCommandAckDto`** | No `ResultJson` | Add field + pass-through |
| **`SendHardwareCommandResponseDto`** | No `ResultJson` | Add field from ack |
| **`HardwareCommandDispatcher`** | Waits for ack; returns message | Forward **`resultJson`** |
| **`GET /api/devices/unpaired`** | Does not exist | New endpoint (registry already tracks unpaired) |
| **UI `waitForHardwareAck`** | 450 ms simulated delay | **REST** `/api/devices/commands` (see P8-D1) |
| **UI `SessionProvider`** | Optimistic stroke/burst on click | Defer until device ack + parse `resultJson` |
| **UI pairing** | `DevicePairingPanel` in **Options** (single Sub) | Dedicated dialog + all-Subs admin |
| **UI Burst button** | Simulated ack + optimistic session | **Disabled or “Phase 9”** until burst firmware (P8-D2) |

---

## Already done (Phase 4/7 bonus — refine, do not duplicate)

- [x] **Paste device ID + Pair/Revoke** — `DevicePairingPanel` in **Options → Hardware device**
- [x] **`GET /api/devices/status?subTarget=`** — pairing panel + system status header
- [x] **Token expiry display** — `deviceTokenExpiry.ts` + warn/expired notice in Options panel
- [x] **`RevokePairing` hub push** — device clears NVS on revoke (Phase 7 fix)
- [x] Swagger **Authorize** (JWT Bearer) for API dev testing

---

## Decisions (set before coding)

| # | Decision | Options | Choice | Date |
|---|----------|---------|--------|------|
| P8-D1 | **UI ack path** | REST response only / REST + SignalR `CommandAcknowledged` / SignalR only | ☑ **REST only** — dispatcher blocks until ack | 2026-09-06 |
| P8-D2 | **Burst / automatic UI buttons** | Hide / disable with tooltip / keep simulated | ☑ **Disable** with “Coming in Phase 9” tooltip | 2026-09-06 |
| P8-D3 | **Pairing dialog entry point** | New top-level **Hardware** menu / toolbar button / keep Options only | ☑ **Toolbar “Hardware” button** → dedicated dialog | 2026-09-06 |
| P8-D4 | **Remove pairing from Options?** | Keep both / move to dedicated dialog only | ☑ **Link only** — Options → Open Hardware… | 2026-09-06 |
| P8-D5 | **All-Subs status fetch** | N × `GET status` per Sub / new **`GET /api/devices/status/all`** | ☑ **N × status** via `fetchSubs()` | 2026-09-06 |
| P8-D6 | **`unpaired` list scope** | Dom-global list / filter by nothing (all online unpaired) | ☑ **Dom-global** — `GET /api/devices/unpaired` in scope | 2026-09-06 |
| P8-D7 | **Session write timing** | After REST success only / also update on SignalR push | ☑ **REST only** (matches P8-D1) | 2026-09-06 |
| P8-D8 | **Manual stroke session event** | Store `powerPercent` only / add **`actualStrokeMs`** from `resultJson` | ☑ **`actualStrokeMs`** in session summary | 2026-09-06 |
| P8-D9 | **Firmware version bump** | e.g. `0.8.0-phase8` (wire `resultJson`) | ☑ **`0.8.10-phase8`** (incl. reconnect/ARP hardening) | 2026-09-06 |
| P8-D10 | **Test Sub** | e.g. `Slv66` | ☑ `Slv66` | 2026-09-06 |

### Suggested defaults (for walkthrough — confirm or override)

| # | Recommendation | Rationale |
|---|----------------|-----------|
| P8-D1 | **REST response only** for Phase 8 | Dispatcher already blocks until ack; simpler than hub client in UI; add SignalR later if needed for multi-tab |
| P8-D2 | **Disable burst + automatic** with “Coming in Phase 9” | Firmware has no burst/automatic execution yet |
| P8-D3 | **Toolbar / header “Hardware” button** → dedicated dialog | Matches plan §4.1 production UX |
| P8-D4 | **Move** — thin link in Options → opens Hardware dialog | Avoid two competing pairing UIs |
| P8-D5 | **N × status** first (Subs list usually small); batch endpoint if perf issue | Min API surface |
| P8-D6 | **Dom-global** unpaired list | Registry is deviceId-keyed; Dom auth already scopes operator |
| P8-D7 | **REST only** (matches P8-D1) | Single code path for session commit |
| P8-D8 | **Parse `actualStrokeMs`** into session summary text | Device-as-source-of-truth principle |

---

## A. Shared + API — `resultJson` pass-through

### A.1 DTOs (`SomNet.Shared`)

- [x] Add `ResultJson` to `HardwareCommandAckDto`
- [x] Add `ResultJson` to `SendHardwareCommandResponseDto`
- [x] Regenerate / update UI TypeScript types if not inferred from OpenAPI

### A.2 Dispatcher + hub

- [x] `HardwareCommandDispatcher` — copy `acknowledgement.ResultJson` into REST response
- [x] `HardwareHub.AckCommand` — `CommandAcknowledged` payload includes `resultJson` (for future UI hub client)
- [x] Swagger / OpenAPI reflects new fields (via controller DTOs; verify in `/swagger` after API restart)

### A.3 Firmware wire (minimal)

- [x] `signalr_client.sendAckCommand` — accept optional `resultJson`; include in `arguments[0]`
- [x] `command_handler.sendAck` — pass through `resultJson` from mode completion (already built locally)
- [x] Serial `[CMD] resultJson=...` unchanged (regression check)
- [x] Bump firmware version per P8-D9; flash test device — **`0.8.10-phase8`** on `esp32-84CCA85C36B4`

---

## B. API — unpaired devices (optional but planned)

- [x] `GET /api/devices/unpaired` — auth required (Dom JWT)
- [x] Response: `{ deviceId, connectedAt }[]` from `DeviceConnectionRegistry` (extend registry if `connectedAt` not tracked)
- [x] Controller + integration test or Swagger manual verify
- [x] Document in [02-API-Reference.md](./02-API-Reference.md) when stable

**Skip criteria:** If deferred, note in sign-off — paste-ID flow still satisfies exit criteria.

---

## C. UI — command integration (stroke + abort)

### C.1 API client

- [x] `sendHardwareCommand(subTarget, commandKey, payloadJson)` → `POST /api/devices/commands`
- [x] Map response: `delivered`, `acknowledged`, `success`, `message`, **`resultJson`**
- [x] User-visible errors: not paired, not connected, timeout, device reject

### C.2 Replace simulated ack

- [x] Remove or gate `SIMULATED_ACK_MS` in `hardwareCommandAck.ts`
- [x] `HardwareCommandProvider.executeCommand` — call REST; pending state until response (or hub event if P8-D1)
- [x] `ManualControls` — **Stroke** sends `{ powerPercent, strokeMs }` via `computeStrokeMs()`
- [x] **Abort** sends `{ }` or `{ reason: "operator" }` with `commandKey: "abort"`
- [x] Handle `success: false` (show toast / inline error; do not record session stroke)

### C.3 Burst / automatic (per P8-D2)

- [x] Burst button disabled or hidden with Phase 9 note
- [x] Automatic mode unchanged or gated similarly

---

## D. UI — session source of truth

- [x] `recordManualStroke` — call **after** successful command response, not on button click alone
- [x] Parse `resultJson` for `actualStrokeMs` (stroke) — extend `ManualActionEvent` or summary builder if needed
- [x] `sessionSummary.ts` — prefer device fields when present
- [x] Failed / rejected command — **no** session event appended
- [x] Abort flow — increment `abortCount` only on device abort ack success; stroke interrupted does not add session stroke (`recordManualAbort` + `interrupted` in `resultJson`)

---

## E. UI — pairing UX

### E.1 Dedicated Hardware dialog

- [x] New dialog component (tabs or sections per plan §4.1):
  - [x] **All Subs** — table: Sub, device ID, paired/connected, token expiry, Pair/Revoke per row
  - [x] **Online now** — unpaired list (when §B done); select row → pair to chosen Sub
  - [x] **Enter device ID** — migrate from `DevicePairingPanel`
- [x] Reuse `deviceTokenExpiry.ts` — **yellow** (≤30 days), **red** (expired)
- [x] Entry point per P8-D3; Options panel per P8-D4

### E.2 All-Subs admin

- [x] Load Sub list via `fetchSubs()`
- [x] Fetch status per Sub (or batch endpoint per P8-D5)
- [x] Row actions: Pair (opens paste or pre-filled ID), Revoke with confirm
- [x] Refresh after pair/revoke; sync system status header

---

## F. Verification tests

### F.1 Stroke from UI (happy path) — verified 2026-09-06

- [x] Device paired + connected
- [x] Manual **Stroke** in browser → relay toggles; REST `success: true` (short + long strokes)
- [x] Response includes **`resultJson`** with `actualStrokeMs`
- [x] Session history reflects stroke **after** ack (not before); UI pending state tracks relay duration
- [x] Command button shows pending during request (~stroke duration + network)

### F.2 Device reject / offline

- [ ] Unpaired Sub → clear error in UI
- [ ] Device disconnected → “not connected” message
- [ ] Invalid payload (if testable) → no session write

### F.3 Abort mid-pulse — verified 2026-09-06

**Setup:** Manual mode; **Maximum Stroke** ≥ 5000 ms; power 100%. Two runs at ~1.4 s and ~2.3 s abort.

- [x] Start long stroke (5000 ms) from UI
- [x] Click **Abort** while pulse active — relay LED off immediately
- [x] Relay opens; dual ack: stroke `success: false` (`interrupted`, `actualStrokeMs`), abort `success: true`
- [x] UI pending state clears correctly; session `abortCount` updated
- [x] API log: paired stroke + abort dispatch per run

### F.4 Busy reject — verified 2026-09-06

- [x] While stroke active, second stroke rejected (UI blocks / device busy)
- [x] UI shows error; no duplicate session events

### F.5 Pairing regression — verified 2026-09-06

- [x] Pair via new dialog (paste ID)
- [x] Revoke → device unpaired (Phase 7 `RevokePairing`)
- [x] Re-pair same device ID
- [ ] Expiry notice still correct in all-Subs table (not re-checked this session)

### F.6 Optional — unpaired list

- [ ] Factory-reset or clear pairing on device; device online unpaired
- [ ] **Online now** shows device ID; pair to Sub without typing MAC

| Test | Pass? |
|------|-------|
| UI stroke → relay (short + long) | ☑ |
| `resultJson` on REST response | ☑ |
| Session after ack / UI tracks relay | ☑ |
| UI abort mid-pulse | ☑ |
| Busy reject from UI | ☑ |
| Pair/revoke via new dialog | ☑ |
| Unpaired list (if built) | ☐ |

**Verification notes (2026-09-06):** Browser hard refresh required to load Phase 8 bundle (Hardware header button). Device `esp32-84CCA85C36B4`, Sub `Slv66`, firmware **`0.8.10-phase8`**. USB unplug/replug reconnect (5×) + strokes verified without browser refresh; API reachability ping + timestamp/disconnect logging. **Abort mid-pulse:** two runs — `actualStrokeMs` 1399 ms and 2320 ms on 5000 ms requested strokes; dual ack on serial and API dispatcher.

---

## G. Documentation updates

- [x] [Hardware-User-Guide.md](./Hardware-User-Guide.md) — UI stroke path (replace Swagger-only note)
- [x] [06-SignalR-And-Hardware.md](./06-SignalR-And-Hardware.md) — `resultJson` on wire
- [x] [`PROTOCOL.md`](../SomNet.Device/docs/PROTOCOL.md) — `resultJson` no longer “proposed”
- [x] [02-API-Reference.md](./02-API-Reference.md) — `unpaired` endpoint + response fields
- [x] Parent plan §10 Phase 8 status → **Signed off**
- [x] [Documents/README.md](./README.md) — Phase 8 checklist linked

---

## Phase 8 exit sign-off

| Criterion | Done |
|-----------|------|
| Dom pairs device from **polished** UI (not dev-only Options placement) | ☑ |
| Manual **stroke** works from UI without Swagger | ☑ |
| **`resultJson`** end-to-end (device → API → UI) | ☑ |
| Session/history driven by device ack (stroke) | ☑ |
| **Abort** mid-pulse E2E from UI | ☑ |
| **Busy** reject E2E from UI | ☑ |
| Decisions P8-D1–D10 recorded | ☑ |
| No out-of-scope burst/automatic firmware merged | ☑ |

**Completed by:** User + agent verification on hardware  
**Date:** 2026-09-06

---

## Next phase

→ [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 **Phase 9 — Burst and automatic modes**

**Phase 9 carry-forward:** Enable burst/automatic UI buttons; `BurstSequenceMode` / `AutomaticSessionMode` firmware; session summaries from multi-stroke `resultJson`.
