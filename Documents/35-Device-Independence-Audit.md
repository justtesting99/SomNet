# Device independence audit (operator UI)

**Status:** Living audit — update when adding operator state.  
**Rule:** Each physical ESP (`deviceId`) is a **separate instance**. The only intentional coupling is **one signed-in operator shell** (Dom, Sub, layout, dialogs).

Normative rules: [34 — Operator V2](./34-Operator-Session-And-Accessory-V2-Rules.md).

---

## 1. Per device (must stay isolated)

| Concern | Storage / authority | UI entry |
|--------|---------------------|----------|
| Operation mode (manual / automatic) | `deviceOperationModeStorage` + `DeviceOperationModeProvider` | `DeviceModeToggle` per panel |
| Scene session | `sessionAccessoryStorage` `(dom, sub, deviceId)` | `DeviceSubSessionControls` |
| Accessory output | same | `DeviceSubSessionControls` |
| Pairing / control settings | API `DomSubDeviceSettings` + `DevicePairingSettingsProvider` | Controls in `DeviceOperationScope` |
| Automatic **running** (runtime) | `deviceAutomaticRunningLocal` map + per-device hint | `setDeviceAutomaticRunning` |
| Server session row | `SessionProvider.sessionsByKey` `(sub, deviceId)` | `useOperationSession()` |
| Ready ack (double-click) | `subPresentAckStorage` per device | `SiteUserReadyProvider` |
| Hardware commands | Unicast `deviceId` on REST | `useOperationDeviceId()` |
| Command pending locks | `deviceId::commandKey` | `HardwareCommandProvider` |
| Hub automatic complete | `ack.deviceId` (API) | `AutomaticSessionHubListener` |

Tab-sync messages that are **per device:** `device-session`, `running` (with `deviceId`), `device-mode`, `scene-session`, `device-accessory`.

---

## 2. Intentionally shared (operator shell only)

| Concern | Why shared |
|--------|------------|
| Auth / Dom identity | One operator login |
| Selected **Sub** | One video/site context at a time |
| **Focus** device (`selectedDeviceId`) | Which device drives **header status** and **live video** preview tokens |
| Dom-level app options (notifications, video bandwidth, etc.) | Install/operator prefs — not motion |
| `OptionsProvider` while dialog open | Edits **Focus** device row only (by design); motion uses `DevicePairingSettingsProvider` |
| History dialog default filter | UX filter; API supports per-`deviceId` |
| Sub-level ready banner dismiss | `readyBannerStorage` (cosmetic; does not gate motion per device) |

**Not shared:** manual vs automatic, scene, accessory, running, session history row in progress, stroke/automatic parameters.

---

## 3. Fixed in this audit (were incorrectly shared)

| Issue | Fix |
|-------|-----|
| Global `ModeProvider` / mode picker gate | Removed from `main.tsx`; per-device mode only |
| Tab-sync `session: null` cleared **all** tabs when Focus had no session | `device-session` per `deviceId` from `sessionsByKey` |
| Tab-sync `running` applied only to Focus device | `setDeviceAutomaticRunning(deviceId, …)` for any device |
| Pending commands cleared on Focus change | Clear only on **Sub** change |
| Sub change ended only Focus session | `endAllInProgressSessionsForSub` |
| Running tab-sync only from Focus `OptionsProvider` effect | Broadcast from `setDeviceAutomaticRunning` |
| Tab-sync `command-lock` blocked **all** devices | `hardwareCommandLockKey` + per-device `CommandButton` / banner |

---

## 4. Known remaining coupling (documented, not motion-critical)

| Area | Behavior | Risk | Follow-up |
|------|----------|------|-----------|
| `SessionAccessoryProvider` | React state mirrors **Focus** device (single-device header path) | Multi-device uses `DeviceSubSessionControls`; header path legacy | Split provider or remove header controls entirely |
| `useLiveSession().activeSession` | Alias of Focus device session | Callers must use `useOperationSession()` / `sessionsByKey` in panels | Deprecate direct `activeSession` in controls (mostly done) |
| `SystemStatusProvider` | Polls Focus (+ relay if different) | Status chip is Focus-only by design | Per-device status chips in panel if needed |
| `VideoDisplayProvider` / expand | One expand target | Video is Focus device | Optional per-device video later |
| Tab-sync `command-lock` | ~~Keys not scoped~~ | — | **Fixed** — `deviceId::commandKey`; UI locks per device |
| `videoFeedRestoreHint` | Global sessionStorage | Video rehydrate for Focus | Acceptable for shared monitors |
| `PairingSettings` DTO | Both `automatic` + `motorAutomatic` fields per row | API shape; only one plane used per `actuatorKind` | Server already per `deviceId` |
| `reconcileFromServer` (TabSync) | Still probes **Focus** `fetchActiveSession` on visibility | Other devices rely on `device-session` + rehydrator | Extend reconcile loop all registrations |
| `SessionRehydrator` | One-shot per device in loop (first match returns timer) | May miss parallel rehydrate on load | Refactor to per-device effects |

---

## 5. API / firmware (out of UI scope but same rule)

- Commands require `deviceId` (X-6).
- Session rows carry `deviceId`.
- No API mutex between relay and motor on same Sub.
- Hub forwards `deviceId` on operator acks.

---

## 6. PR checklist (device work)

- [ ] No new global `useMode()` or Sub-level motion flags  
- [ ] State keyed by `(subTarget, deviceId)` at minimum  
- [ ] Tab-sync includes `deviceId` for motion/session/running  
- [ ] Controls run inside `DeviceOperationScope`  
- [ ] Tests: two devices, different modes, no cross-clear on Focus change  

---

## Document history

| Date | Change |
|------|--------|
| 2026-10-27 | Initial audit after per-device mode + tab-sync fixes |
