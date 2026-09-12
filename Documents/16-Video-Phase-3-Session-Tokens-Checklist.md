# Video — Phase 3 Session-scoped stream tokens

**Status:** **In progress** — implementation landed; manual-mode smoke pass reported (2026-09-11)

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
| **V3-D3** | TTL | 30 min; refresh while session active |
| **V3-D4** | Pairing settings | `videoTunnelBaseUrl` per dom/sub (dev: PC LAN go2rtc embed base) |
| **V3-D5** | Validation v1 | API-only mint; go2rtc token check deferred to Phase 5 |
| **V3-D6** | Feed visibility timeout | **Options → General** `videoFeedTimeoutSeconds` (default **30**). Manual: timer starts when stroke/burst/**abort** completes (`manualVideoActivitySeq` + command pending idle). Bursts stay up for full command duration. Automatic: post-session grace same duration. Mode/sub/sign-out: immediate hide. |
| **V3-D7** | Preview feeds | **Start feeds** above video panels (manual + automatic). Creates/reuses in-progress session for tokens; **2×** action timeout. Manual: strokes/bursts use normal timeout. Automatic: feeds stay up while session runs; post-Stop grace unchanged. |

---

## Implementation checklist

### API

- [ ] DTOs + signing key in config (dev `appsettings.Development.json`)
- [ ] Token endpoint; verify session belongs to dom/sub
- [ ] Hook session start (manual first action / automatic start) — UI calls token endpoint
- [ ] Hook session end — revoke `jti` / session id (in-memory list v1)

### UI

- [ ] On `activeSession` set → fetch tokens → update `videoSources`
- [x] On mode switch / sub change / sign-out → clear iframe src immediately
- [x] Manual idle + automatic post-session timeout (V3-D6)
- [ ] Rehydration: re-fetch tokens if session still active

### Tests

- [ ] Unit tests — token claims, expiry, revoke

---

## Smoke tests

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **V3-T1** | Manual: first stroke (no feeds before) | Both iframes load with `token=` query param; stay up for next stroke | ☑ **2026-09-11** |
| **V3-T2** | Clear feeds: **Switch mode** or **Sub change** (manual has no End button) | iframes cleared; re-mint after end returns 403 | ☑ **2026-09-11** |
| **V3-T5** | Manual: stroke/burst → wait timeout (Options; tested 10s and 30s) | Feeds hide after timeout from **command complete** (Burst/Stroke button re-enabled); next action restores | ☑ **2026-09-11** |
| **V3-T6** | Automatic: Stop → wait timeout | Feeds hide after grace; immediate on mode switch | ☑ **2026-09-11** |
| **V3-T3** | Refresh mid-session | Rehydration restores feeds | ☐ |
| **V3-T4** | Wrong dom/sub JWT | Token endpoint 403 | ☐ |

---

## Exit criteria

**V3-T1–T4** pass → start [Phase 4](./17-Video-Phase-4-Action-Snapshots-Checklist.md).

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial stub |
| 2026-09-11 | Manual-mode smoke: feeds on first stroke; persist until mode/sub/sign-out |
| 2026-09-11 | **V3-D6** — configurable feed timeout (General options); V3-T1/T2 pass |
| 2026-09-11 | Fix — manual idle timer starts on command **end** (activity seq), not stroke start |
| 2026-09-11 | V3-T5/T6 pass — idle/post-session timeout; measure from button re-enabled (hardware pending cleared) |
