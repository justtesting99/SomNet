# Video — Phase 3 Session-scoped stream tokens

**Status:** **Blocked** — complete [Phase 2](./15-Video-Phase-2-UI-Embed-Checklist.md) first

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

---

## Implementation checklist

### API

- [ ] DTOs + signing key in config (dev `appsettings.Development.json`)
- [ ] Token endpoint; verify session belongs to dom/sub
- [ ] Hook session start (manual first action / automatic start) — UI calls token endpoint
- [ ] Hook session end — revoke `jti` / session id (in-memory list v1)

### UI

- [ ] On `activeSession` set → fetch tokens → update `videoSources`
- [ ] On session end / mode switch / sub change → clear iframe src
- [ ] Rehydration: re-fetch tokens if session still active

### Tests

- [ ] Unit tests — token claims, expiry, revoke

---

## Smoke tests

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **V3-T1** | Manual session start | Both iframes load with token query param | ☐ |
| **V3-T2** | End session | iframes cleared; token rejected if reused | ☐ |
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
