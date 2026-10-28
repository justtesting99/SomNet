# Frontend Architecture

SomNet.UI is a React 18 single-page application built with TypeScript, Vite, and Tailwind CSS. There is no client-side router — after login the dashboard renders directly (V2: no global manual/automatic mode picker).

## Build and Hosting

| Aspect | Detail |
|--------|--------|
| Dev server | Vite on port `56761`, proxies `/api` → `http://localhost:5031` |
| Production build | `npm run build` → `SomNet.UI/dist/` |
| Integrated hosting | `SomNet.API.csproj` runs UI build before API build; API serves `dist/` with SPA fallback |

**Entry point:** `src/main.tsx`

## Application Bootstrap

```
main.tsx
  └── AuthProvider
        └── App
```

Before authentication, only `LoginForm` renders. After login, the full provider tree mounts. Per-device operation mode (`manual` \| `automatic`) lives in `DeviceOperationModeProvider`, not a top-level route.

## Provider Tree (Authenticated)

See `App.tsx` for the authoritative nesting. Simplified:

```
SubTargetProvider
  SubDeviceProvider                    ← device roster + header Focus deviceId
    SessionProvider
      DomSessionsProvider
        HardwareProvider
          OptionsProvider                ← per-device pairing settings GET/PUT (?deviceId=)
            DevicePairingSettingsProvider
              DeviceOperationModeProvider  ← manual | automatic per deviceId
                TabSyncProvider
                  NotifyProvider
                    SiteUserReadyProvider
                      HardwareCommandProvider
                        SystemStatusProvider
                          AutomaticSessionHubListener   ← session complete, segment acks, ButtonEventReceived
                          SessionRehydrator
                          DeviceSceneAccessoryBootstrap
                          HistoryProvider
                            AppShell → DashboardWithVideo
                              VideoDisplayProvider
                                DashboardLayout
                                  DeviceOperationsPanel   ← per Focus device: scene, motor/relay controls
```

### Provider Responsibilities

| Provider | File | Key Behavior |
|----------|------|--------------|
| **AuthProvider** | `context/AuthProvider.tsx` | Login, register, logout; persists session in `localStorage` key `somnet-auth`; attaches Bearer token to all API calls; 401 → logout |
| **SubDeviceProvider** | `context/SubDeviceProvider.tsx` | Paired `deviceId` list for Sub; header **Focus** selection |
| **DeviceOperationModeProvider** | `context/DeviceOperationModeProvider.tsx` | `manual` \| `automatic` per `deviceId` (relay + motor) |
| **DevicePairingSettingsProvider** | `context/DevicePairingSettingsProvider.tsx` | Scopes `OptionsProvider` loads to `DeviceOperationScope` |
| **SubTargetProvider** | `context/SubTargetProvider.tsx` | Current sub name; opens `SubSelectionDialog` |
| **SessionProvider** | `context/SessionProvider.tsx` | Creates/updates/ends sessions via API; maintains manual event log for summaries |
| **DomSessionsProvider** | `context/DomSessionsProvider.tsx` | Dom sessions dialog open state |
| **OptionsProvider** | `context/OptionsProvider.tsx` | Loads/saves `PairingSettingsDto` via `/api/settings?deviceId=`; **`motorAutomatic` / `motorManual` / relay `automatic`** planes; **persists only after explicit user edit**; `setDeviceAutomaticRunning(subTarget, deviceId, kind, running)` map — never persisted to server |
| **SessionRehydrator** | `components/hardware/SessionRehydrator.tsx` | On load: per-device scene hints; `GET /api/sessions/active`, automatic probe, restore session + running for matching `deviceId` |
| **AutomaticSessionHubListener** | `components/hardware/AutomaticSessionHubListener.tsx` | `automatic-session-complete` per `deviceId`; **`motor-automatic-segment`** → pattern graph store; `ButtonEventReceived` → ready banner |
| **SiteUserReadyProvider** | `context/SiteUserReadyProvider.tsx` | Sub double-click ack (P16-D1/D10), ready banner dismiss; pairs with `useSiteUserReadyStartFeed` for auto **Start feed** |
| **TabSyncProvider** | `context/TabSyncProvider.tsx` | Cross-tab session/sub/`session-accessory`/command sync via `BroadcastChannel` |
| **HardwareProvider** | `context/HardwareProvider.tsx` | Hardware dialog open state |
| **NotifyProvider** | `context/NotifyProvider.tsx` | Notify dialog state |
| **HistoryProvider** | `context/HistoryProvider.tsx` | History dialog state |
| **SystemStatusProvider** | `context/SystemStatusProvider.tsx` | Polls system status every 10 seconds |
| **VideoDisplayProvider** | `context/VideoDisplayProvider.tsx` | Mobile video expand on stroke/burst |
| **HardwareCommandProvider** | `context/HardwareCommandProvider.tsx` | Tracks pending command keys; calls `waitForHardwareAck` |

## Views and Navigation

There is no URL-based routing. Navigation is state-driven:

| State | View |
|-------|------|
| `!isAuthenticated` | `LoginForm` |
| `isAuthenticated` | `AppShell` + `DashboardLayout` — controls = `DeviceOperationsPanel` for header **Focus** `deviceId` |

Operator norms (scene vs accessory, per-device routing): [34 — V2 rules](./34-Operator-Session-And-Accessory-V2-Rules.md).

### AppShell Header

The sticky header (`components/layout/AppShell.tsx`) contains:

- **SessionUsers** — Clickable Dom and Sub names (open dialogs)
- **Notify** button
- **SessionInProgressSwitch** (when in a mode) — slide switch + optional session id (Options → Debug)
- **SystemStatusDisplay** — Connection indicator
- **Switch mode** (when in a mode)
- **History**, **Options**, **Sign out**

**Switch mode** with Session in Progress **ON** stops the automatic device if needed but **keeps** the server session row (P16-D7). **Sign out** is blocked while Session in Progress is **ON**. **Sub change** still ends the active session (`sub-change`) via `SubSelectionDialog`.

## Dialogs

| Dialog | Component | Trigger |
|--------|-----------|---------|
| Sub selection | `SubSelectionDialog.tsx` | Click Sub name in header |
| Dom sessions | `DomSessionsDialog.tsx` | Click Dom name in header |
| History | `HistoryDialog.tsx` | Header "History" — session id + summary; `SessionSnapshotGallery` per row (per-action Manual/Automatic badge + `actionSummary` caption; no session-level mode pill) |
| Options | `OptionsDialog.tsx` | Header "Options" — tabs **General**, **Notifications**, **Debug**, **Account** (`config/optionsDialog.ts`) |
| Notify | `NotifyDialog.tsx` | Header "Notify" |

### SubSelectionDialog

- Lists subs from `GET /api/subs`
- Add sub: immediate `POST /api/subs`
- Remove sub: confirmation dialog, then `DELETE /api/subs?subName=`
- Changing sub ends any active session (`sub-change` reason)

## Operation Modes

### Manual Mode (`ManualControls.tsx`)

**Panels:**
- **Power Settings** — Min/max stroke ms, vertical power slider (0–100%), computed stroke ms readout
- **Burst Settings** — Burst stroke count, delay seconds
- **Actions** — Stroke, Burst (with visual separation), Abort

**Session behavior:**
- Requires **Session in Progress ON** (creates server row via `startSessionForAccessory`)
- Each stroke/burst appends to local event log and PATCHes summary
- Abort ends session with reason

**Commands:** Wrapped in `CommandButton` with keys `stroke`, `burst`, `abort` (gated when switch off).

### Device operations (`DeviceOperationsPanel.tsx`)

For the **Focus** device on the current Sub:

- **Connection** — online/offline from polled status (`resolveDeviceConnectionLabel`), not registration cache alone.
- **Mode toggle** — per-device manual vs automatic (`DeviceModeToggle`).
- **Scene + Accessory** — `DeviceSubSessionControls` (V2; motion not gated on accessory).
- **Motion** — `DeviceOperationScope` supplies `deviceId` + `actuatorKind` to child controls:
  - Relay: `ManualControls` \| `AutomaticControls`
  - Motor: `MotorManualControls` \| `MotorAutomaticControls`

### Relay automatic (`AutomaticControls.tsx`)

**Panels:**
- **Power Settings** — Min/max power % sliders, min/max stroke ms
- **Timing Settings** — Stroke gaps, delay before start, end session rules
- **Burst Settings** — Bursts On, **burst placement** (six options: main+ vs instead-of × spread / even / chance — [36](./36-Burst-Placement-Modes-Design.md)), percent (label depends on placement), style, burst power/delay/stroke ranges (Phase 10). Helpers: `burstPlacement.ts`, `relayBurstPlan.ts`, `relayPowerSchedule.ts`.
- **Controls** — Program selector, Start, Stop, Abort

**Field minimums (UI):** Main-program gap **`strokeMinSeconds`** / **`strokeMaxSeconds`** — min **1** sec each (`automaticFieldRules.ts`). Burst **`burstDelayMin`** and **`burstStrokePowerMin`** — min **1** (`burstFieldRules.ts`). Max fields may use **0** where product rules allow (burst delay max; burst power max on relative 0–100 scale). Normalized on load/save.

**Session behavior:**
- Requires **Session in Progress ON** (server row); **Start** sends REST `automatic-start` on that row
- Stop sends cooperative stop; session summary from device via hub `automatic-session-complete`
- Abort cuts immediately; same hub path for history
- **Live overrides (Phase 11):** When **`allowAutomaticModeOverrides`** is enabled (Options → General), settings stay editable during a session; debounced save (400 ms) also sends **`automatic-update`** to the device. Default is **locked** while running.
- **Browser refresh (UI rehydration):** `SessionRehydrator` runs only when the Session in Progress client hint is set; then queries `GET /api/sessions/active`, probes automatic runs via `automatic-update`, restores `activeSession` + local `running`. Stale rows are ended or discarded per mode.

**Commands:** Keys `automatic-start`, `automatic-stop`, `automatic-update` (when live overrides enabled), `abort` (during automatic session), plus UI `session-accessory` for the header switch.

**Hub:** `AutomaticSessionHubListener` syncs end-rule, abort, and cooperative stop without blocking the UI on long bursts.

### Motor manual (`MotorManualControls.tsx`)

- Duty % slider (min/max from `motorManual` settings).
- **Run** / **Stop** → `motor-run` / `motor-stop` (requires scene session + readiness rules).
- Settings plane: `PairingSettingsDto.motorManual` (per `deviceId`).

### Motor automatic (`MotorAutomaticControls.tsx`)

**Programs (continuous speed — not relay stroke/gap):**

| UI label | `automaticMode` |
|----------|-----------------|
| Set Speed | `periodic` |
| Random Speed | `randomSpeed` |
| Random Speed and Timing | `randomSpeedAndTiming` |
| Speed Wave | `powerWave` |
| Build-Up | `buildUp` |

**Panels:** speed/duty min/max, segment timing, ramp ms, delay before start, end session (`minutes` \| `noAutoEnd` — stroke count coerced away in start payload). Burst block mirrors relay (including **burst placement**); execution spec [31 §5.2.1](./31-Motor-Actuator-Device-Design.md#521-bursts-in-motor-automatic-design-locked-2026-10-27), checklist **M1d** — firmware not shipped yet.

**Controls:** Start (ensures scene session via `ensureAutomaticSessionForDeviceStart`), Stop, **Abort always visible** (disabled when idle). Start payload: `buildMotorAutomaticStartPayload` → `automatic-start` with `actuatorKind: hbridge`.

**Running / hub:** Same cooperative stop + `automatic-session-complete` path as relay; `running` keyed per `(subTarget, deviceId, motor)`. Live overrides: debounced `automatic-update` when enabled in Options.

**Field rules:** `motorAutomaticFieldRules.ts`, mode copy in `motorAutomaticModeInfo.ts`.

**Graph:** Clearing segment store on Start/complete (`clearMotorAutomaticSegments`); live segments from hub listener — see § Motor pattern graph.

### Relay automatic — pattern graph

Same video column **Feeds \| Graph** when Focus device is **relay**. Plots **commanded power %** (stroke on / gap off). Preview: `relayPowerSchedule.ts`; live: hub `relay-automatic-segment` → `relayAutomaticSegmentStore.ts` → `RelayPatternGraphPanel`. Clear segments on Start in `AutomaticControls`.

Design reference: [31 §13](./31-Motor-Actuator-Device-Design.md#13-as-built--hub-path-motor-programs-ui-telemetry).

## UI Component Library

Located in `components/ui/`:

| Component | Purpose |
|-----------|---------|
| `Button` | Primary/ghost variants |
| `Panel` | Fieldset-style section wrapper |
| `CommandButton` | Action button with pending/disabled state during hardware ack |
| `Input`, `NumberField`, `Checkbox`, `RadioGroup` | Form controls |
| `Slider`, `StrokePowerSlider`, `VerticalRangeControl` | Power sliders with 10% tick marks |
| `DateRangePicker`, `DateTimeInput` | History filtering, notifications |
| `Card` | Content containers |

### Vertical Slider Layout

Power sliders use a track shell pattern for alignment:
- Tick marks at 10% intervals
- Track, 0%/100% labels, and thumb travel aligned via absolute positioning and thumb-size compensation in CSS

### Panel Spacing

`Panel.tsx` wraps children in a flex column. Spacing between action groups (e.g. Stroke vs Burst) uses explicit `marginTop` and `paddingTop` with a border — fieldset layout does not honor standalone spacer divs.

## API Client Layer

Fetch wrappers in `src/api/`:

| Module | Endpoints |
|--------|-----------|
| `auth.ts` | `/api/auth/*` |
| `sessions.ts` | `/api/sessions/*` including `GET /api/sessions/active` |
| `history.ts` | `/api/history/*` |
| `settings.ts` | `/api/settings` |
| `subs.ts` | `/api/subs` |
| `videoSnapshots.ts` | `/api/video/sessions/{id}/snapshots` |
| `options.ts` | Legacy — unused; settings moved to `settings.ts` |

All authenticated calls go through a shared `apiFetch` helper that injects the Bearer token.

## Types and Utilities

| Path | Purpose |
|------|---------|
| `types/modes.ts` | Manual/automatic control state TypeScript types |
| `types/pairingSettings.ts` | Pairing settings shape |
| `types/hardwareCommand.ts` | Command key constants |
| `types/sessionHistory.ts` | History DTO mirrors |
| `utils/sessionSummary.ts` | Aggregates manual events into readable summaries |
| `utils/sessionProgress.ts` | In-progress session heuristics; automatic rehydrate eligibility |
| `utils/automaticSessionReconcile.ts` | Device idle probe via `automatic-update`; stale session cleanup |
| `utils/automaticSessionFinalize.ts` | Hub finalize grace period; cooperative stop helpers |
| `utils/stroke.ts` | Maps power % to stroke duration ms |
| `config/sessionUsers.ts` | Default/suggested sub names |

### Session Summary Format

Manual summaries aggregate strokes and bursts by settings:

```
2 strokes at 60%, 1 burst at 75% (5 strokes @ 5s delay).
```

In-progress sessions prefix with `In progress:`.

Automatic summaries:

```
Automatic session ran 12 minutes, stop.
```

## Hardware Command Flow (Current UI)

```
User clicks CommandButton
  → sendHardwareCommand / sendHardwareCommandRaw (api/hardwareCommand.ts)
  → POST /api/devices/commands { subTarget, commandKey, payloadJson }
  → Device ack returned in REST response (delivered / acknowledged / success)
  → SessionProvider updated after ack (manual stroke/burst; automatic start/stop)
  → Automatic session end also via AutomaticSessionHubListener (hub CommandAcknowledged)
```

**Automatic live update (Phase 11):**

```
User edits automatic setting while session running (overrides enabled)
  → OptionsProvider debounced PUT /api/settings (400 ms)
  → AutomaticControls debounced automatic-update push (400 ms)
  → POST /api/devices/commands { commandKey: automatic-update, payloadJson: full snapshot }
```

## Session Rehydration (Browser Refresh)

See [10-UI-Session-Rehydration-Checklist.md](./10-UI-Session-Rehydration-Checklist.md) (automatic) and [11-UI-Manual-Session-Rehydration-Checklist.md](./11-UI-Manual-Session-Rehydration-Checklist.md) (manual).

```text
Page load (authenticated; last mode may restore from localStorage)
  → OptionsProvider: GET /api/settings + stroke limits (running forced false in API response)
  → SessionRehydrator (after settingsLoaded; once per Dom+Sub per page load):
       GET /api/sessions/active?subTarget=
       if manual + summary starts with "In progress":
            parseManualInProgressSummary → rehydrateSession + setMode('manual')
       else if automatic + summary === "In progress":
            probe device (automatic-update)
            if device idle → POST /end (stale server record); skip rehydrate
            else → rehydrateSession + setAutomaticRunningLocal(true) + setMode('automatic')
  → AutomaticSessionHubListener: finalize when hub ack + activeSession.mode === 'automatic'
```

**Settings safety on refresh:** Pairing settings are not written back to the API until the operator edits a control (`userEditedRef`). The `running` flag is local-only and stripped on every settings PUT/GET.

**Deployment note:** When using integrated API hosting, run `npm run build` in `SomNet.UI` (or rebuild the API project) so `dist/` includes UI changes — the API serves the production bundle, not the Vite dev server.

## Video Components

`components/video/`:

- **VideoMonitor** — Embedded video feed area in dashboard
- **VideoFeed** — Feed display (iframe `src` from session tokens when active)
- **VideoFeedStartPanel** — **Start feed** / **Start feeds** preview controls (Phase 3; label follows live feed selection)
- **VideoMaximizeOverlay** — Full-screen overlay on mobile when `expandOnAction` triggers
- **SessionSnapshotGallery** / **AuthenticatedSnapshotImage** — action stills grouped by `actionIndex`; captions from API `actionSummary` (`captionForSnapshotGroup`, `modeForSnapshotGroup` in `utils/snapshotActionCaption.ts`); JWT blob fetch via `apiFetchBlob` + object URL
- **SnapshotLightbox** — full-screen still viewer (double-click in gallery; Close / Esc)
- **SiteUserReadyBanner** — banner when device double-click reports site user ready ([23](./23-Device-Button-Clicks-Checklist.md))
- **Motor pattern graph** (`MotorPatternGraphPanel`, video column **Feeds | Graph**) — **SomNet.API + operator UI only** today. See below.

### Motor pattern graph (scope)

| Phase | Behavior |
|-------|----------|
| **Idle / before Start** | Planned **commanded speed %** from current motor automatic settings (for random modes, a stable **example** path — device choices are unknown until run). |
| **Running (API path)** | Live curve built from hub acks `correlationId: motor-automatic-segment` (device reports each ramp: from/to speed %, duration, `programElapsedMs`). Requires paired device → API → `AutomaticSessionHubListener` → in-memory segment store. **Now** marker uses UI Start anchor + interpolated position on that live curve. |
| **Standalone / Mode A** ([26](./26-ESP32-Local-Offline-Mode-Design.md)) | **Not a product goal** for the ESP `/operate` panel unless standalone later exposes the same telemetry to a browser (e.g. local WebSocket or polled status). Firmware may still emit segment JSON for API use when SignalR is connected. |
| **Relay** | Same **Feeds \| Graph** tab when Focus device is `relay` — **commanded power %** (stroke/gap steps); live from `relay-automatic-segment` hub acks. |

**Why API-centric:** Random (and timing-random) programs are decided on the device at segment boundaries. A truthful running graph **must** consume device-reported targets, not UI guesses. Preview remains useful for reasoning about settings; live graph is an **operator session tool** alongside video/history, not firmware-local UI.

**Code:** `utils/motorSpeedSchedule.ts` (preview + `buildMotorSpeedScheduleFromLiveSegments`), `utils/motorAutomaticSegmentStore.ts`, firmware `emitSegmentRamp` in `motor_automatic_session_mode.cpp`.

**Live video feeds (Options → General):** `appOptions.mobileVideoExpandDefault` — `"both"` \| `"monitor1"` (front) \| `"monitor2"` (rear). Implemented in `utils/liveVideoFeedPreference.ts` + `useSessionVideoSources` — disabled cameras do not mount iframes or connect to go2rtc (bandwidth/CPU savings on mobile/tunnel). **`actionSnapshotFeeds`** is separate (stills only). On mobile, `appOptions.autoExpandVideoOnMobile` opens the selected feed full screen after commands. Rebuild **`SomNet.UI/dist`** after UI changes when using integrated API hosting.

**Options → Debug:** `appOptions.showActiveSessionIdInHeader` — optional `sess-…` under the header Session in Progress switch.

**Options → General (video):** `appOptions.videoFeedTimeoutSeconds` — live feed hide delay after manual actions or automatic session end. **`appOptions.actionSnapshotFeeds`** — `both` (front + rear) or `rear` only; applies to **manual** per stroke/burst and **automatic** session-end still ([V4-D8/V4-D9](./17-Video-Phase-4-Action-Snapshots-Checklist.md)). **`appOptions.videoFeedBandwidth`** — `high` \| `medium` \| `low` for live MSE bandwidth hints ([Phase 6 V6-D18](./19-Video-Phase-6-Tunnel-Checklist.md)).

**Feed lifecycle (Phase 3+):** `hooks/useSessionVideoSources.ts` mints tokens via `POST /api/video/sessions/{id}/tokens`, manages feed visibility/timeouts, and restores state after refresh (`videoFeedRestoreHint`, `automaticDeviceRunningHint`). **`VITE_VIDEO_FRONT_URL`** (see [08-Development-Guide.md](./08-Development-Guide.md)) is the **feature gate** only (`isVideoConfigured()`); iframe URLs come from API token response, not static env. Unset env → video disabled (placeholder). Dashboard labels **Front** / **Rear** (`monitor1` / `monitor2`). Architecture: [13-Video-And-Camera-Architecture.md](./13-Video-And-Camera-Architecture.md).

## Styling

- **Tailwind CSS** with slate dark theme (`bg-slate-950`, indigo accents)
- Responsive layout: dashboard uses grid; header stacks on small screens
- `wide` prop on AppShell expands max-width to 1600px when in a mode

## State Persistence

| Data | Storage |
|------|---------|
| Auth token + user | `localStorage` (`somnet-auth`) |
| Per-device operation mode | `DeviceOperationModeProvider` (+ persistence hook per `deviceId`) |
| Video aside tab (Feeds \| Graph) | `localStorage` (`somnet-video-aside-tab`) — motor graph tab when Focus device is `hbridge` |
| Settings | Server (`DomSubSettings` table); loaded on mount; saved only after user edit |
| Active session (after refresh) | Restored from server via `GET /api/sessions/active` (automatic: + device probe; manual: parse PATCH summary) |
| Session history | Server (`Sessions` table) |
| Selected sub | `localStorage` (`somnet.selectedSub`) + cross-tab broadcast |
| Automatic `running` (relay + motor) | Per-device map in `OptionsProvider` — never persisted to server |

## Multi-Tab Sync

See [12-UI-Multi-Tab-Sync-Checklist.md](./12-UI-Multi-Tab-Sync-Checklist.md).

```text
First browser tab state change (session / running / sub / command pending)
  → BroadcastChannel post (somnet-tab-sync)
Second browser tab TabSyncProvider
  → syncSessionFromRemote / setAutomaticRunningLocal / applySubFromSync
  → storage events for auth + mode (localStorage)
Tab visible (fallback)
  → GET /api/sessions/active reconcile (no automatic-update probe on peer sync)
Manual stroke in second tab
  → ensureManualSession adopts GET /api/sessions/active before POST
```

**Soft command lock:** `CommandButton` disabled in Tab B while Tab A has a pending hardware command.

## Known Gaps

1. `options.ts` API module is orphaned from pre-refactor MockDataStore era

## Future Enhancements

- **Relay session timeline / graph** — motor **commanded speed %** graph shipped (video column, hub segment acks). Relay automatic timeline graphs still deferred. See [Phase 10 checklist §8](./09-ESP32-Phase-10-Checklist.md#8-relationship-to-other-future-work).
- **Video / edge settings — site installer vs remote operator** — SomNet web users (Dom/operators) are **not** the people who wire cameras at the tool site. **Target:** extend **ESP32 local setup UI** (`/config` or status flow) and/or **edge gateway local UI** so the **on-site installer** enters edge URL, camera layout, RTSP paths/credentials; device or edge **posts to API → database** (scoped to Sub/pairing). Remote SomNet UI **reads** stored settings (Phase 3+ tokens/URLs) — no manual `VITE_VIDEO_*` or `go2rtc.yaml` for operators. Edge agent (Phase 5+) pulls from API and applies go2rtc config. Video still runs on Pi/PC edge, not ESP32; ESP32 is the likely **installer config entry point** alongside Wi‑Fi/server pairing. Phase 2–3 bench: env + yaml only. See [13 §13](./13-Video-And-Camera-Architecture.md#13-somnet-touchpoints) · [14 plan — Future enhancements](./14-Video-Implementation-Plan.md#future-enhancements-todo) · [Hardware User Guide — Video](./Hardware-User-Guide.md).
