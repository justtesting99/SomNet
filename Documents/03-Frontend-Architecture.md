# Frontend Architecture

SomNet.UI is a React 18 single-page application built with TypeScript, Vite, and Tailwind CSS. There is no client-side router — the app uses conditional rendering based on authentication and selected operation mode.

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
        └── ModeProvider
              └── App
```

Before authentication, only `LoginForm` renders. After login, the full provider tree mounts.

## Provider Tree (Authenticated)

```
SubTargetProvider          ← Selected sub name, sub dialog
  SessionProvider            ← Live session lifecycle + API sync
    DomSessionsProvider      ← Dom-wide sessions dialog
      OptionsProvider        ← Per Dom+Sub settings (debounced save)
        AutomaticSessionHubListener  ← Hub finalize for automatic session end
        AutomaticSessionRehydrator   ← Restore session after browser refresh
        NotifyProvider         ← Notify dialog state
          HistoryProvider      ← History dialog state
            SystemStatusProvider ← Polls /api/system/status (10s interval)
              AppShell
                ModeSelector | DashboardLayout
                  VideoDisplayProvider   ← Video expand on action
                    HardwareCommandProvider ← Command pending/ack state
                      ManualControls | AutomaticControls
```

### Provider Responsibilities

| Provider | File | Key Behavior |
|----------|------|--------------|
| **AuthProvider** | `context/AuthProvider.tsx` | Login, register, logout; persists session in `localStorage` key `somnet-auth`; attaches Bearer token to all API calls; 401 → logout |
| **ModeProvider** | `context/ModeProvider.tsx` | `manual` \| `automatic` \| `null`; persists last mode in `localStorage` (`somnet.operationMode`) |
| **SubTargetProvider** | `context/SubTargetProvider.tsx` | Current sub name; opens `SubSelectionDialog` |
| **SessionProvider** | `context/SessionProvider.tsx` | Creates/updates/ends sessions via API; maintains manual event log for summaries |
| **DomSessionsProvider** | `context/DomSessionsProvider.tsx` | Dom sessions dialog open state |
| **OptionsProvider** | `context/OptionsProvider.tsx` | Loads/saves `PairingSettingsDto` via `/api/settings`; **persists only after explicit user edit** (`userEditedRef`); 400 ms debounce; `running` never persisted |
| **AutomaticSessionRehydrator** | `components/hardware/AutomaticSessionRehydrator.tsx` | On load: `GET /api/sessions/active`, device probe, restore `activeSession` + local `running` |
| **AutomaticSessionHubListener** | `components/hardware/AutomaticSessionHubListener.tsx` | Finalizes automatic sessions on hub `automatic-session-complete`; gates on `activeSession`, not `running` |
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
| `isAuthenticated && mode === null` | `ModeSelector` |
| `mode === 'manual'` | `DashboardLayout` + `ManualControls` |
| `mode === 'automatic'` | `DashboardLayout` + `AutomaticControls` |

### AppShell Header

The sticky header (`components/layout/AppShell.tsx`) contains:

- **SessionUsers** — Clickable Dom and Sub names (open dialogs)
- **Notify** button
- **SystemStatusDisplay** — Connection indicator
- **Switch mode** (when in a mode)
- **History**, **Options**, **Sign out**

Active sessions are ended automatically on mode switch, sign-out, or sub change.

## Dialogs

| Dialog | Component | Trigger |
|--------|-----------|---------|
| Sub selection | `SubSelectionDialog.tsx` | Click Sub name in header |
| Dom sessions | `DomSessionsDialog.tsx` | Click Dom name in header |
| History | `HistoryDialog.tsx` | Header "History" |
| Options | `OptionsDialog.tsx` | Header "Options" |
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
- Session starts lazily on first stroke or burst
- Each action appends to local event log
- Summary PATCHed to API after each action
- Abort ends session with reason

**Commands:** Wrapped in `CommandButton` with keys `stroke`, `burst`, `abort`.

### Automatic Mode (`AutomaticControls.tsx`)

**Panels:**
- **Power Settings** — Min/max power % sliders, min/max stroke ms
- **Timing Settings** — Stroke gaps, delay before start, end session rules
- **Burst Settings** — Bursts On, percent, style, burst power/delay/stroke ranges (Phase 10)
- **Controls** — Program selector, Start, Stop, Abort

**Field minimums (UI):** Main-program gap **`strokeMinSeconds`** / **`strokeMaxSeconds`** — min **1** sec each (`automaticFieldRules.ts`). Burst **`burstDelayMin`** and **`burstStrokePowerMin`** — min **1** (`burstFieldRules.ts`). Max fields may use **0** where product rules allow (burst delay max; burst power max on relative 0–100 scale). Normalized on load/save.

**Session behavior:**
- Session starts immediately on Start (REST `automatic-start` + live session record)
- Stop sends cooperative stop; session summary from device via hub `automatic-session-complete`
- Abort cuts immediately; same hub path for history
- **Live overrides (Phase 11):** When **`allowAutomaticModeOverrides`** is enabled (Options → General), settings stay editable during a session; debounced save (400 ms) also sends **`automatic-update`** to the device. Default is **locked** while running.
- **Browser refresh (UI rehydration):** `AutomaticSessionRehydrator` queries the server for an in-progress automatic session, probes the device (`automatic-update` accept/reject), restores `SessionProvider.activeSession`, sets local `running: true`, and switches to automatic mode. Stale server rows (device idle) are closed without rehydrating. Controls do not render until settings finish loading.

**Commands:** Keys `automatic-start`, `automatic-stop`, `automatic-update` (when live overrides enabled), `abort` (during automatic session).

**Hub:** `AutomaticSessionHubListener` syncs end-rule, abort, and cooperative stop without blocking the UI on long bursts.

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
- **VideoFeed** — Feed display
- **VideoMaximizeOverlay** — Full-screen overlay on mobile when `expandOnAction` triggers

Video expand behavior is controlled by `appOptions.autoExpandVideoOnMobile` and `appOptions.mobileVideoExpandDefault` (`None`, `Monitor1`, `Monitor2`, `Both`).

**Feed mapping (Phase 2):** Dashboard labels **Front** / **Rear** (`monitor1` / `monitor2` internally). URLs from `getDashboardVideoSources()` reading `VITE_VIDEO_FRONT_URL` and `VITE_VIDEO_REAR_URL` (see [08-Development-Guide.md](./08-Development-Guide.md)). Unset env → placeholder panel. Session-scoped tokens in Phase 3. Architecture: [13-Video-And-Camera-Architecture.md](./13-Video-And-Camera-Architecture.md).

## Styling

- **Tailwind CSS** with slate dark theme (`bg-slate-950`, indigo accents)
- Responsive layout: dashboard uses grid; header stacks on small screens
- `wide` prop on AppShell expands max-width to 1600px when in a mode

## State Persistence

| Data | Storage |
|------|---------|
| Auth token + user | `localStorage` (`somnet-auth`) |
| Last operation mode | `localStorage` (`somnet.operationMode`) — manual or automatic |
| Settings | Server (`DomSubSettings` table); loaded on mount; saved only after user edit |
| Active session (after refresh) | Restored from server via `GET /api/sessions/active` (automatic: + device probe; manual: parse PATCH summary) |
| Session history | Server (`Sessions` table) |
| Selected sub | `localStorage` (`somnet.selectedSub`) + cross-tab broadcast |
| `settings.automatic.running` | Local React state only — never persisted to server |

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

- **Session timeline / graph** — visual plan or replay of an automatic session (main strokes, burst clusters, gaps, power envelope). Placement TBD: Automatic page (pre-start preview or live), session history detail, or both. See [Phase 10 checklist §8](./09-ESP32-Phase-10-Checklist.md#8-relationship-to-other-future-work).
- **Video / edge settings — site installer vs remote operator** — SomNet web users (Dom/operators) are **not** the people who wire cameras at the tool site. **Target:** extend **ESP32 local setup UI** (`/config` or status flow) and/or **edge gateway local UI** so the **on-site installer** enters edge URL, camera layout, RTSP paths/credentials; device or edge **posts to API → database** (scoped to Sub/pairing). Remote SomNet UI **reads** stored settings (Phase 3+ tokens/URLs) — no manual `VITE_VIDEO_*` or `go2rtc.yaml` for operators. Edge agent (Phase 5+) pulls from API and applies go2rtc config. Video still runs on Pi/PC edge, not ESP32; ESP32 is the likely **installer config entry point** alongside Wi‑Fi/server pairing. Phase 2–3 bench: env + yaml only. See [13 §13](./13-Video-And-Camera-Architecture.md#13-somnet-touchpoints-when-implemented) · [14 plan — Future enhancements](./14-Video-Implementation-Plan.md#future-enhancements-todo) · [Hardware User Guide — Video](./Hardware-User-Guide.md).
