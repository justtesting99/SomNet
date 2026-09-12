# Video — Phase 3 Session-scoped stream tokens

**Status:** **Signed off** (2026-09-11) — V3-T4 manual smoke **deferred** (403 logic implemented in API)

> **Manual mode note:** There is no **End session** button — one server session accumulates strokes until **Abort** (still in progress), **Switch mode**, **Sub change**, or **Sign out** ([07 § lifecycle](./07-Session-And-History.md#when-sessions-end)). Video: **no feeds until first stroke** → both feeds load with tokens → **feeds stay up** for subsequent strokes in the same session. Test **V3-T2** (clear feeds) via **Switch mode** or **Sub change**, not a manual End button.

| Related | Link |
|---------|------|
| Architecture §10 | [13 — Session-scoped streaming](./13-Video-And-Camera-Architecture.md#10-session-scoped-streaming-recommended-security-model) |
| Plan | [14-Video-Implementation-Plan.md](./14-Video-Implementation-Plan.md) |

**Goal:** SomNet **local API** mints **short-lived front/rear stream tokens** when a session starts; UI loads iframe URLs with tokens; tokens **revoke on session end**.

**Explicitly out of scope:** Edge agent validation (Phase 5); tunnel; Blob snapshots (Phase 4); Azure.

---

## Locked decisions (draft)

| ID | Decision | Proposed choice |
|----|----------|-----------------|
| **V3-D1** | Token format | Signed JWT (HMAC) with `sessionId`, `dom`, `sub`, `feed`, `exp`, `jti` |
| **V3-D2** | Endpoint | `POST /api/video/sessions/{sessionId}/tokens` (operator JWT) |
| **V3-D3** | TTL | 30 min; remint on feed show while session active (no background refresh timer) |
| **V3-D4** | Pairing settings | `tunnelBaseUrl` (`VideoSettingsDto`) per dom/sub (dev: `/go2rtc/…` via YARP) |
| **V3-D5** | Validation v1 | API-only mint; go2rtc token check deferred to Phase 5 |
| **V3-D6** | Feed visibility timeout | **Options → General** `videoFeedTimeoutSeconds` (default **30**). Manual: timer starts when stroke/burst/**abort** completes (`manualVideoActivitySeq` + command pending idle). Bursts stay up for full command duration. Automatic: post-session grace same duration. Mode/sub/sign-out: immediate hide. |
| **V3-D7** | Preview feeds | **Start feeds** above video panels (manual + automatic). Creates/reuses in-progress session for tokens; **2×** action timeout. Manual: strokes/bursts use normal timeout. Automatic: feeds stay up while session runs; post-Stop grace unchanged. |

---

## Implementation checklist

### API

- [x] DTOs + signing key in config (dev `appsettings.Development.json`)
- [x] Token endpoint; verify session belongs to dom/sub
- [x] UI mints on feed show (stroke, preview, rehydrate) — not on bare session POST
- [x] Hook session end — `RevokeSession` on `/api/sessions/{id}/end` (remint does not revoke — V3-D5 v1)

### UI

- [x] On feed show + active session → fetch tokens → update `videoSources`
- [x] On mode switch / sub change / sign-out → clear iframe src immediately
- [x] Manual idle + automatic post-session timeout (V3-D6)
- [x] Preview feeds manual + automatic (V3-D7)
- [x] Rehydration: re-fetch tokens; manual restore feeds + idle timeout; automatic restore when `running`
- [x] `videoFeedRestoreHint` (sessionStorage) — F5 / remount feed restore
- [x] `automaticDeviceRunningHint` — automatic Start feeds + refresh (`running` not inferred from server row alone)
- [x] `SessionRehydrator`: `probeDevice: false` on refresh (no spurious `automatic-update`)

### Tests

- [x] Unit tests — `VideoStreamTokenServiceTests` (claims, revoke, remint)

---

## Smoke tests

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **V3-T1** | Manual: first stroke (no feeds before) | Both iframes load with `token=` query param; stay up for next stroke | ☑ **2026-09-11** |
| **V3-T2** | Clear feeds: **Switch mode** or **Sub change** (manual has no End button) | iframes cleared; re-mint after end returns 403 | ☑ **2026-09-11** |
| **V3-T5** | Manual: stroke/burst → wait timeout (Options; tested 10s and 30s) | Feeds hide after timeout from **command complete** (Burst/Stroke button re-enabled); next action restores | ☑ **2026-09-11** |
| **V3-T6** | Automatic: Stop → wait timeout | Feeds hide after grace; immediate on mode switch | ☑ **2026-09-11** |
| **V3-T3a** | Manual: stroke → feeds up → **F5 refresh** | Same session; both feeds reload with `token=`; idle timeout from rehydrate | ☑ **2026-09-11** |
| **V3-T3b** | Automatic: **Start** → feeds up → **F5 refresh** | Stop/Abort enabled; feeds reload with `token=` | ☑ **2026-09-11** |
| **V3-T4a** | Token mint after session ended (Switch mode / sub change) | `POST …/tokens` → **403**; UI already cleared iframes (V3-T2) | ☐ **deferred** *(API enforces via `TryGetActiveSessionForSub`)* |
| **V3-T4b** | Token mint with wrong `subTarget` query | **403** (Swagger or curl with valid operator JWT) | ☐ **deferred** *(API enforces sub mismatch)* |
| **V3-T7** | Manual/automatic: **Start feeds** preview (+ automatic **F5** after preview) | Feeds load; 2× timeout; **Start** enabled until real Start; refresh restores preview feeds | ☑ **2026-09-11** |

---

## Exit criteria

**V3-T1–T3, V3-T5–T7** pass → start [Phase 4](./17-Video-Phase-4-Action-Snapshots-Checklist.md). **V3-T4** manual Swagger/curl verification deferred (403 behavior implemented).

### V3-T3 — refresh mid-session

1. Get feeds visible (stroke, Start session, or **Start feeds**).
2. **F5** refresh (stay in same mode / sub).
3. Pass: feeds return without another stroke; browser Network shows new `POST /api/video/sessions/{id}/tokens`; iframes have `token=`.

### V3-T4 — token rejected

**T4a (ended session):** Complete V3-T2 (Switch mode or Sub change). In Swagger (`/swagger`), `POST /api/video/sessions/{oldSessionId}/tokens?subTarget=…` with operator JWT → **403**.

**T4b (wrong sub):** Use a valid in-progress `sessionId` for Sub A but `subTarget=SubB` → **403**.

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial stub |
| 2026-09-11 | Manual-mode smoke: feeds on first stroke; persist until mode/sub/sign-out |
| 2026-09-11 | **V3-D6** — configurable feed timeout (General options); V3-T1/T2 pass |
| 2026-09-11 | Fix — manual idle timer starts on command **end** (activity seq), not stroke start |
| 2026-09-11 | V3-T5/T6 pass — idle/post-session timeout; measure from button re-enabled (hardware pending cleared) |
| 2026-09-11 | V3-D7 preview feeds; automatic controls fix (`sessionRunning` = `state.running`) |
| 2026-09-11 | Manual rehydrate restores video feeds (V3-T3a support); sign-off procedures for T3/T4/T7 |
| 2026-09-11 | V3-T3b/T7 pass; T3-T4 deferred; T3a fail → `manualVideoRehydrateSeq` (Strict Mode–safe restore) |
| 2026-09-11 | T3a/Start feeds refresh — `sessionStorage` feed-restore hint (survives provider remount) |
| 2026-09-11 | Automatic refresh — no rehydrate probe / no duplicate live-override `automatic-update`; feed restore keeps deadline paused |
| 2026-09-11 | Automatic Start feeds + refresh — device-running hint; preview rehydrate no longer sets `running` |
| 2026-09-11 | Phase 3 signed off; V3-T4 smoke verification deferred |
