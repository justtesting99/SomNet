# Device independence audit (operator UI)

**Status:** Section 4 coupling items **resolved** (2026-10-27).  
**Rule:** Each physical ESP (`deviceId`) is a **separate instance**. The only intentional coupling is **one signed-in operator shell** (Dom, Sub, layout, dialogs).

Normative rules: [34 — Operator V2](./34-Operator-Session-And-Accessory-V2-Rules.md).

---

## 1. Per device (must stay isolated)

| Concern | Storage / authority | UI entry |
|--------|---------------------|----------|
| Operation mode (manual / automatic) | `deviceOperationModeStorage` + `DeviceOperationModeProvider` | `DeviceModeToggle` per panel |
| Scene session | `sessionAccessoryStorage` `(dom, sub, deviceId)` | `useDeviceSceneSessionControls` / `DeviceSubSessionControls` |
| Accessory output | same | same |
| Pairing / control settings | `DevicePairingSettingsProvider` (actuator-scoped updates) | `useControlPanelSettings` in scope |
| Automatic **running** | `deviceAutomaticRunningLocal` + `setDeviceAutomaticRunning` | Options broadcast + panel |
| Server session row | `SessionProvider.sessionsByKey` | `useOperationSession()` |
| Ready ack | `subPresentAckStorage` per device | `SiteUserReadyProvider` |
| Hardware commands | Unicast `deviceId` | `useOperationDeviceId()` |
| Command pending locks | `deviceId::commandKey` | `HardwareCommandProvider` |
| Hub automatic complete | `ack.deviceId` | `AutomaticSessionHubListener` |
| Status poll | `SystemStatusProvider.getDeviceStatus(deviceId)` | Panel + header focus |
| Video restore hint | `videoFeedRestoreHint` per `deviceId` | `useSessionVideoSources` (focus device) |
| Motor pattern graph segments | `motorAutomaticSegmentStore` per `deviceId` | `MotorPatternGraphPanel` (Focus motor only) |

Tab-sync (per device): `device-session`, `running`, `device-mode`, `scene-session`, `device-accessory`, scoped `command-lock`.

---

## 2. Intentionally shared (operator shell only)

| Concern | Why shared |
|--------|------------|
| Auth / Dom identity | One operator login |
| Selected **Sub** | One video/site context at a time |
| **Focus** `deviceId` | Header status chip, live video tokens, Options dialog row for focus device |
| Dom-level app options | Notifications, bandwidth, mobile expand prefs |
| History dialog default filter | UX filter |
| Sub-level ready banner dismiss | Cosmetic |
| `VideoDisplayProvider` expand UI | Single video column; `expandOnAction` only when source device is focus |

**Not shared:** manual/automatic mode, scene, accessory, running, in-progress session, stroke/auto parameters.

---

## 3. Removed / replaced (was shared)

| Was | Now |
|-----|-----|
| `SessionAccessoryProvider` + header `SubSessionControls` | `useDeviceSceneSessionControls` + panel only |
| `useLiveSession().activeSession` | `sessionsByKey` + `useOperationSession()`; video uses `useFocusSession()` |
| Focus-only status poll + relay side poll | Poll **every** registration; `getDeviceStatus(deviceId)` |
| Global video restore hint | Keyed by `deviceId` |
| `reconcileFromServer` one device | All registrations on tab focus |
| `SessionRehydrator` single early-return loop | One effect per device |
| Legacy tab-sync `session`, `session-accessory`, `relay-lock` | Removed; use `device-session`, `scene-session`, `device-accessory` |
| `ModeProvider` / `ModeSelector` / `AutomaticModeControls` | Deleted |
| Motor UI touching relay `automatic` plane | `updateAutomatic` / `updateMotorAutomatic` guarded by `actuatorKind` |

---

## 4. API / firmware (unchanged rule)

- Commands require `deviceId` (X-6).
- Session rows carry `deviceId`.
- No API mutex between relay and motor on same Sub.
- Hub forwards `deviceId` on operator acks.

`PairingSettings` DTO still contains both `automatic` and `motorAutomatic` fields per API row; UI only mutates the plane for that device's `actuatorKind`.

---

## 5. PR checklist (device work)

- [ ] No new global motion state  
- [ ] State keyed by `(subTarget, deviceId)`  
- [ ] Tab-sync includes `deviceId` for motion/session/running  
- [ ] Controls inside `DeviceOperationScope`  
- [ ] Scene/accessory via `useDeviceSceneSessionControls`, not focus provider  

---

## 6. Re-audit (2026-10-27) — gaps found and disposition

| Finding | Severity | Disposition |
|---------|----------|-------------|
| Orphan `SessionAccessoryProvider.tsx` in tree | Low | **Removed** (App no longer mounted it) |
| Hub complete used **Focus** `Options.automatic` for all `deviceId`s | **High** | **Fixed** — `readCachedDeviceSettings` + per-kind running; `applyAutomaticDeviceComplete` ignores relay `running` bit |
| `deviceSettingsCache` only filled on Focus change in Options | **High** | **Fixed** — `DevicePairingSettingsProvider` caches every loaded/updated row |
| Relay **mode toggle** did not stop automatic on that device | **High** | **Fixed** — `useRelayModeChange` in `DeviceModeToggle` |
| Panel controls used **header** `systemStatus` instead of per-device poll | Medium | **Fixed** — `getDeviceStatus(commandDeviceId)` in manual/auto/motor controls |
| `ManualControls` pending keys without `deviceId` | Medium | **Fixed** |
| `SessionProvider` still exposes focus-only APIs (`endActiveSessionIfNeeded`, `recordManualStroke`, …) | Low | **Accepted** — only used internally / video `prepareManualSession`; motion uses `useOperationSession` |
| `OptionsProvider` still loads/saves **Focus** row (Options dialog) | Low | **Accepted** — shell; motion is `DevicePairingSettingsProvider` |
| `useControlPanelSettings` falls back to Options outside `DeviceOperationScope` | Low | **Accepted** — no production path outside panel |
| Video (`useSessionVideoSources`) is **Focus-only** by design | Low | **Accepted** — single preview column |
| Double-click changes **Focus** + Sub | Low | **Accepted** — V2 ready ack (doc 34) |
| `config/operationMode.ts` global `localStorage` | Low | **Dead** — `ModeProvider` removed; safe to delete in cleanup |
| Motor cold rehydrate `probeDeviceAutomaticSessionActive` uses relay payload | Low | **Mitigated** — `SessionRehydrator` passes `probeDevice: false` |
| `TabSyncBanner` only shows remote lock for Focus device | Low | **Accepted** — other devices still lock locally via `CommandButton` |

---

## Document history

| Date | Change |
|------|--------|
| 2026-10-27 | Initial audit |
| 2026-10-27 | §4 coupling table cleared — implementation complete |
| 2026-10-27 | §6 re-audit + hub cache, mode-switch stop, per-device status in controls |
