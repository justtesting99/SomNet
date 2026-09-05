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
| **ModeProvider** | `context/ModeProvider.tsx` | `manual` \| `automatic` \| `null` |
| **SubTargetProvider** | `context/SubTargetProvider.tsx` | Current sub name; opens `SubSelectionDialog` |
| **SessionProvider** | `context/SessionProvider.tsx` | Creates/updates/ends sessions via API; maintains manual event log for summaries |
| **DomSessionsProvider** | `context/DomSessionsProvider.tsx` | Dom sessions dialog open state |
| **OptionsProvider** | `context/OptionsProvider.tsx` | Loads/saves `PairingSettingsDto` via `/api/settings`; 400 ms debounce on writes |
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
- **Timing & Burst** — Burst style, strokes, delay
- **End Session** — Mode (minutes/strokes/no auto end), values
- **Actions** — Start, Stop

**Session behavior:**
- Session starts immediately on Start
- Stop ends session with duration-based summary

**Commands:** Keys `automatic-start`, `automatic-stop`.

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
| `sessions.ts` | `/api/sessions/*` |
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
  → HardwareCommandProvider.runCommand(key, action)
  → action() executes (e.g. recordManualStroke)
  → waitForHardwareAck(key) — 450ms simulated timeout
  → Pending state cleared
```

**Planned integration:**

```
User clicks CommandButton
  → POST /api/devices/commands { subTarget, commandKey, payloadJson }
  → Optional: SignalR CommandAcknowledged for live feedback
  → Pending state cleared on response/ack
```

## Video Components

`components/video/`:

- **VideoMonitor** — Embedded video feed area in dashboard
- **VideoFeed** — Feed display
- **VideoMaximizeOverlay** — Full-screen overlay on mobile when `expandOnAction` triggers

Video expand behavior is controlled by `appOptions.videoExpandMode` (`None`, `Monitor1`, `Monitor2`, `Both`).

## Styling

- **Tailwind CSS** with slate dark theme (`bg-slate-950`, indigo accents)
- Responsive layout: dashboard uses grid; header stacks on small screens
- `wide` prop on AppShell expands max-width to 1600px when in a mode

## State Persistence

| Data | Storage |
|------|---------|
| Auth token + user | `localStorage` (`somnet-auth`) |
| Settings | Server (`DomSubSettings` table) |
| Session history | Server (`Sessions` table) |
| UI mode selection | React state only (lost on refresh) |
| Selected sub | React state (defaults to first available sub) |

## Known Gaps

1. No SignalR client library in UI for operator-side events
2. `SystemStatusProvider` does not pass `subTarget` query param
3. No device pairing UI — pairing is API-only today
4. `options.ts` API module is orphaned from pre-refactor MockDataStore era
