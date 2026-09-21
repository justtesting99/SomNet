# Device button — single / double click (supplementary)

**Status:** **Signed off** (2026-09-13) — firmware **`0.14.0-button-clicks`**; dev PC bench **BTN-T1–T10**

**Parent scope:** Extends [Phase 6 button policy](./09-ESP32-Phase-6-Checklist.md) (**P6-D10** — log + 10 s credential reset only). Adds **short-press click detection** on the same **D33** button without removing long-hold provisioning reset.

> **Post-P16 (2026-09-20):** Double-click still drives the ready banner and optional auto **Start feed**, and sets the Sub **present ack** required before Dom turns [**Session in Progress**](./25-Session-Accessory-In-Progress-Checklist.md) **ON**. It does not bypass Ready + switch gating for **Stroke** / **Start**.

| Related | Link |
|---------|------|
| GPIO / reset | [Hardware User Guide](./Hardware-User-Guide.md) — 10 s hold |
| Network / provisioning | [09-ESP32-Network-Spec.md](./09-ESP32-Network-Spec.md) |
| Hub protocol | [06-SignalR-And-Hardware.md](./06-SignalR-And-Hardware.md) |
| Start feed (UI) | [16 — Phase 3 Session tokens](./16-Video-Phase-3-Session-Tokens-Checklist.md); `VideoFeedStartPanel` / `useSessionVideoSources.startPreview()` |
| Device plan | [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 known follow-ups |

---

## Goal

The air-tool user at the site presses the **same physical button** used today for Wi‑Fi recovery. Short presses are classified and **relayed to the SomNet API** over the existing SignalR hub connection.

| Gesture | Duration (operator) | v1 behavior |
|---------|---------------------|-------------|
| **Single click** | Press and release quickly | Relay to API — **reserved for future use** (log + operator visibility only; no relay stroke, no session side-effects) |
| **Double click** | Two quick presses | Relay to API → notify web operator **“{Slv66} is ready for session”** → **auto-trigger Start feed** (same as operator clicking **Start feed** / **Start feeds**) |
| **Long hold** | **10 s** (unchanged) | Credential reset → setup AP — **no click events** |

**User story:** The web operator opens SomNet and waits. The person at the tool double-clicks the device button when they are in position. The operator’s dashboard shows readiness and live video starts without the operator hunting for **Start feed**.

---

## Architecture (today vs target)

### Today (`button_input.cpp`)

- Raw GPIO poll every loop; **no debounce FSM**
- Press log: `[BTN] pressed` (500 ms throttle while held)
- **5 s** warning → **10 s** hold → `clearProvisioning()` → release → reboot → `SomNetSetup-XXXX`
- **No** device-initiated hub messages except command **acks** and unsolicited `automatic-session-complete`

### Target

```
Air-tool user (D33)
  → button_input: debounce + single/double classifier
  → signalr_client: ReportButtonEvent (paired hub only)
  → API HardwareHub: validate device JWT + dom/sub
  → SignalR → operator:{dom}  ButtonEventReceived
  → UI AutomaticSessionHubListener + SiteUserReadyProvider:
        · SiteUserReadyBanner “Air tool user ready”
        · useSiteUserReadyStartFeed → if same Sub + canStart → startPreview()  (Start feed)
```

**Explicitly out of scope (v1):**

- Single click triggering relay stroke (P6-D10 still applies)
- Site-user clicks during **provisioning** (hub off) — drop with serial log
- New REST endpoint from device (hub-only, like acks)
- Replacing phone call as primary coordination ([Phase 7b draft](./22-Video-Phase-7b-Edge-Intercom-Draft.md))
- Options UI toggle to disable auto Start feed (defer unless requested)

---

## Locked decisions (set before coding)

| ID | Decision | Proposed choice | Status |
|----|----------|-----------------|--------|
| **BTN-D1** | Button scope | **Short click** + **double click** + **10 s hold reset** on same GPIO | ☑ |
| **BTN-D2** | Single click v1 | **Relay only** — API log; dev console only in UI | ☑ |
| **BTN-D3** | Double click v1 | **Site user ready** + **auto Start feed** when video configured and `canStart` | ☑ |
| **BTN-D4** | Sub routing | Event tied to device’s **paired `subTarget`** from device JWT | ☑ |
| **BTN-D5** | Transport | New hub method **`ReportButtonEvent`** (device → API); new hub event **`ButtonEventReceived`** (API → operators) | ☑ |
| **BTN-D6** | Payload shape | `{ clickType: "single" \| "double", deviceId, subTarget, occurredAtUtc }` | ☑ |
| **BTN-D7** | Click vs hold | Clicks only when release before hold path arms — see [timing](#timing--debounce-proposed) | ☑ |
| **BTN-D8** | Start feed action | Call existing **`startPreview()`** — creates in-progress session, mints tokens, 2× preview timeout | ☑ |
| **BTN-D9** | Modes | **Manual and automatic** — both use preview session before first stroke / automatic Start | ☑ |
| **BTN-D10** | Hub down | **Drop** event; serial `[BTN] click dropped — hub disconnected` | ☑ |
| **BTN-D11** | Firmware version | **`0.14.0-button-clicks`** | ☑ |

---

## Timing & debounce (proposed)

Constants in `include/config.h` (tune on hardware):

| Constant | Proposed | Purpose |
|----------|----------|---------|
| `BUTTON_DEBOUNCE_MS` | **50** | Ignore bounce on press/release |
| `BUTTON_CLICK_MAX_MS` | **500** | Release longer than this → not a click (ignore or log “long press ignored”) |
| `BUTTON_DOUBLE_CLICK_MS` | **400** | Max gap between first release and second press for double |
| `BUTTON_SINGLE_FIRE_MS` | **450** | After first click, wait this long before emitting **single** (allows double detection) |
| `CREDENTIAL_RESET_WARN_MS` | **5000** | Unchanged — suppress click classification while hold ≥ warn (user is doing reset) |
| `CREDENTIAL_RESET_HOLD_MS` | **10000** | Unchanged |

**FSM rules:**

1. While **credential reset triggered** or **await release after reset** → **no clicks**
2. While hold duration ≥ `CREDENTIAL_RESET_WARN_MS` → **no click classification** (only reset path)
3. On release with hold &lt; `BUTTON_CLICK_MAX_MS` → increment click count; start double/single timer
4. Second press within `BUTTON_DOUBLE_CLICK_MS` → emit **double**; cancel pending single
5. Timer expiry with one click → emit **single**

**Serial (debug):** `[BTN] single`, `[BTN] double`, `[BTN] click ignored (hold reset)`, `[BTN] click dropped (hub)`.

---

## Protocol (API + firmware)

### Device → API — hub method

Add to `HardwareHubMethods` / `DeviceConstants`:

| Method | Direction | Notes |
|--------|-----------|-------|
| **`ReportButtonEvent`** | Device invoke | Requires **paired** device JWT |

**DTO (Shared):** `DeviceButtonEventDto`

```json
{
  "clickType": "single",
  "deviceId": "esp32-84CCA85C36B4",
  "subTarget": "Slv66",
  "occurredAtUtc": "2026-09-13T18:00:00Z"
}
```

**API handler:**

- Verify `Context.User` is paired device; `deviceId` / `subTarget` match claims
- Rate-limit per device (e.g. max **5 events / 10 s**) — reject spam
- Log structured event
- `Clients.Group(operator:{dom}).SendAsync(ButtonEventReceived, dto)`

### API → UI — hub event

| Event | Audience | Payload |
|-------|----------|---------|
| **`ButtonEventReceived`** | `operator:{dom}` | Same `DeviceButtonEventDto` |

**UI filter:** Handle only when `dto.subTarget === selectedSub` (ignore other Subs on same Dom).

**Do not** reuse `CommandAcknowledged` / `ExecuteCommand` — button clicks are **not** hardware commands and must not appear in session stroke history.

Update [`SomNet.Device/docs/PROTOCOL.md`](../SomNet.Device/docs/PROTOCOL.md) § device-initiated messages.

---

## UI behavior (double click → Start feed)

### Operator notification

- **Toast or inline banner** (persistent until dismissed or session starts): *“{Slv66} is ready for session”*
- Optional subtle **status chip** on dashboard header (defer if toast sufficient)

### Auto Start feed

When `clickType === "double"` and filters pass:

| Condition | Action |
|-----------|--------|
| Video configured (`isVideoConfigured()`) | Call **`startPreview()`** from `useSessionVideoSources` |
| Same `subTarget` as event | Required |
| `mode` is manual or automatic | Required (not on mode picker) |
| `canStart` true (not pending command, not automatic running, feeds not already loaded) | Start preview |
| `canStart` false but feeds already active | Toast only — “Already monitoring” |
| Video not configured | Toast only — no Start feed |
| Operator on different Sub | Ignore event |

**Parity with manual Start feed button:** Same code path as `VideoFeedStartPanel` → `preview.start()` — including `prepareManualSession` / `prepareAutomaticSession`, token mint, mobile `expandForPlaybackStart`, 2× preview timeout.

### Single click (future)

- Show low-priority toast: *“Device button pressed”* (optional, dev-only flag) **or** silent API log only (**BTN-D2**)
- **No** session, **no** feed, **no** relay

### Multi-tab sync

- **Notification:** All operator tabs for Dom receive hub event (native SignalR)
- **Start feed:** Only tab with matching **Sub selected** and **mode active** should auto-start; other tabs may show toast only
- Optional **TabSync** broadcast (`site-user-ready`) — only if testing shows missed events; hub fan-out may be enough

---

## Implementation checklist

### Firmware (`SomNet.Device`)

- [x] Refactor `button_input.*` — debounce + click/double FSM; preserve 10 s reset FSM
- [x] `config.h` — timing constants (table above)
- [x] `signalr_client` — send `ReportButtonEvent` when hub connected + paired
- [x] Suppress clicks in provisioning mode / hub disconnected
- [x] Unit-style serial tests on bench — `[BTN] single` / `double` → `[HUB] ReportButtonEvent sent` (2026-09-13)
- [x] Bump firmware version (**BTN-D11**)

### Shared (`SomNet.Shared`)

- [x] `DeviceButtonEventDto` + `DeviceButtonClickType` enum
- [x] `HardwareHubMethods.ReportButtonEvent`, `ButtonEventReceived`
- [x] `HardwareCommandKeys` — button keys **not** added to snapshot/stroke lists

### API (`SomNet.API`)

- [x] `HardwareHub.ReportButtonEvent(DeviceButtonEventDto)` — validate claims, rate limit, fan-out
- [x] Logging
- [x] Tests: rate limiter unit tests

### UI (`SomNet.UI`)

- [x] Extend `AutomaticSessionHubListener` — subscribe `ButtonEventReceived`
- [x] `useSiteUserReadyStartFeed` — auto **`startPreview()`** when `canStart`
- [x] `SiteUserReadyBanner` for double-click ready signal
- [x] Types in `deviceButtonEvent.ts` + `hardwareHub.ts`
- [ ] Tests: double click → startPreview called when canStart; ignored wrong sub

### Documentation

- [x] [Hardware User Guide](./Hardware-User-Guide.md) — GPIO table: single (reserved), double (ready + Start feed), 10 s hold unchanged
- [x] [06-SignalR-And-Hardware.md](./06-SignalR-And-Hardware.md) — `ButtonEventReceived` on operator group
- [ ] [02-API-Reference.md](./02-API-Reference.md) — hub section (optional follow-up)
- [x] [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) — §10 follow-up → link here
- [x] [`PROTOCOL.md`](../SomNet.Device/docs/PROTOCOL.md) §7 `ReportButtonEvent`

---

## Smoke tests

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **BTN-T1** | Single click (paired, hub up) | API logs event; optional operator toast; **no** feed, **no** session stroke | ☑ **2026-09-13** |
| **BTN-T2** | Double click — operator on dashboard, video on, same Sub | Banner “ready”; **Start feed** runs; feeds play; preview timeout starts | ☑ **2026-09-13** |
| **BTN-T3** | Double click — feeds already active | Banner only; no duplicate session churn | ☑ **2026-09-13** |
| **BTN-T4** | Double click — operator on different Sub | No Start feed; no banner | ☑ **2026-09-13** |
| **BTN-T5** | Hold **10 s** → release → setup AP | Credential reset unchanged; **zero** click events during/after reset | ☑ **2026-09-13** |
| **BTN-T6** | Hold **5 s** then release (no reset) | No credential reset; **no** single/double misfire | ☑ **2026-09-13** |
| **BTN-T7** | Hub disconnected → double click | Serial drop log; no crash; no API event | ☑ **2026-09-13** |
| **BTN-T8** | Provisioning mode → click | Ignored / dropped; no hub call | ☑ **2026-09-13** |
| **BTN-T9** | Manual + automatic mode | Double click starts preview in **both** modes | ☑ **2026-09-13** |
| **BTN-T10** | Two operator tabs, same Sub | Both get hub event; tab with mode + Sub starts feed | ☑ **2026-09-13** |

**Exit (signed off 2026-09-13):** BTN-T1–T10 on dev PC bench; firmware **`0.14.0-button-clicks`**.

### Sign-off notes (2026-09-13)

**Bench fixes during smoke:**

| Issue | Fix |
|-------|-----|
| `[HUB] ReportButtonEvent skipped - hub not ready` while hub connected | Align readiness with `AckCommand` — do not require `state_ == Paired` (`signalr_client.cpp`) |
| API silent — no log after `ReportButtonEvent sent` | Add `DeviceButtonClickType` to `SomNetJsonOptions` so `"double"` deserializes on SignalR |

**Verified path:** paired device, Status **Ready**, manual mode, Sub **`Slv66`**, double-click → API `Device button Double…` log → green banner → **Start feed** E2E.

---

## Open questions (resolve before coding)

| # | Question | Default if no answer |
|---|----------|----------------------|
| Q1 | Show toast on **single** click or API-only log? | **API log only** (BTN-D2) |
| Q2 | Rate limit values? | 5 events / 10 s per device |
| Q3 | LED feedback on successful double-click send? | **Defer** — serial only v1 |
| Q4 | Auto Start feed when operator not logged in / on login page? | N/A — hub requires operator connection |
| Q5 | Record button events in session timeline? | **No** v1 |

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-13 | Initial supplementary checklist — single (future), double (site ready + Start feed), timing, protocol, UI/API/firmware tasks |
| 2026-09-13 | Implemented — firmware **`0.14.0-button-clicks`**, API hub, UI banner + auto Start feed |
| 2026-09-13 | **Signed off** — BTN-T1–T10; hub readiness + enum JSON fixes documented in sign-off notes |
