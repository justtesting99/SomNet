# Video — Phase 5 Edge agent (session lifecycle + gateway)

**Status:** **Signed off** (2026-09-12) — Layout A-dev manual v1

> **Phase 4:** Signed off (manual v1).

| Related | Link |
|---------|------|
| Architecture §10 | [13 — Session-scoped streaming](./13-Video-And-Camera-Architecture.md#10-session-scoped-streaming-recommended-security-model) |
| Plan | [14-Video-Implementation-Plan.md](./14-Video-Implementation-Plan.md) |
| Edge README | [`SomNet.Edge/README.md`](../SomNet.Edge/README.md) |

**Goal:** Small **edge agent** on PC: `session_started` / `session_ended` from API; go2rtc stream readiness; **token gateway** on `/go2rtc`; **snapshots on device ack** without UI callback.

**Out of scope (Phase 5):** Tunnel (Phase 6); Pi deploy (Phase 7); automatic-mode snapshots; edge SignalR observer (API ack hook used instead).

---

## Locked decisions (v1)

| ID | Decision | Choice |
|----|----------|--------|
| **V5-D1** | Edge process | `SomNet.Edge.Agent` — HTTP on **5190** |
| **V5-D2** | API → edge notify | Fire-and-forget `POST /api/edge/session-started\|session-ended` + `X-SomNet-Edge-Key` |
| **V5-D3** | Token gateway (dev) | API middleware on `/go2rtc/*` — validate `token` query; cookie for follow-on WS/HLS |
| **V5-D4** | Snapshot trigger | API after successful hardware ack (`manual:stroke`, `manual:burst`) — **UI callback removed** |
| **V5-D5** | USB stream disable | Token revocation gates access; go2rtc yaml streams stay loaded (RTSP pull stop → Phase 7) |
| **V5-D6** | Config | `Video:Edge` in API; `EdgeAgent` in agent `appsettings.json` |

---

## Implementation checklist

### Edge agent (`SomNet.Edge.Agent`)

- [x] `POST /api/edge/session-started` — track active session; verify go2rtc `front`/`rear` streams
- [x] `POST /api/edge/session-ended` — remove session from store
- [x] `GET /health`, `GET /api/edge/sessions`
- [x] API key middleware (`X-SomNet-Edge-Key`)
- [x] `SomNet.Edge/scripts/start-edge-agent.ps1`

### API

- [x] `VideoEdgeNotificationService` — notify edge on session start/end
- [x] `VideoStreamGatewayMiddleware` — token + cookie gate on `/go2rtc`
- [x] `VideoActionSnapshotTrigger` — capture on hardware ack (replaces UI)
- [x] `HardwareCommandKeys` in `SomNet.Shared`
- [x] `appsettings.Development.json` — `Video:Edge` enabled

### UI

- [x] Remove `queueCaptureActionSnapshots` from `SessionProvider` (API owns capture)

### Tests

- [x] `VideoStreamGatewayMiddlewareTests` — allow/block `/go2rtc`
- [x] `HardwareCommandKeysTests`

---

## Smoke tests

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **V5-T1** | Start edge agent + API + go2rtc; start manual session (first stroke) | Edge `GET /api/edge/sessions` lists session; go2rtc streams logged available | ☑ **2026-09-12** (API script; use `X-SomNet-Edge-Key` header) |
| **V5-T2** | Open feed with session token | `/go2rtc/stream.html?src=front&token=…` plays | ☑ **2026-09-12** (HTTP 200 via API proxy) |
| **V5-T3** | Open `/go2rtc/stream.html?src=front` **without** token | **403** | ☑ **2026-09-12** |
| **V5-T4** | End session (Switch mode / Sub change) | Edge sessions empty; revoked token → **403** on feed URL | ☑ **2026-09-12** (revoke verified; edge clears ended session) |
| **V5-T5** | Manual stroke → ack (edge agent running; UI callback removed) | JPEGs + DB rows; history gallery still works | ☑ **2026-09-12** (API stroke + disk; history sorted by `lastActivityAt`) |

**Exit:** V5-T1–T5 → [Phase 6 — Tunnel](./19-Video-Phase-6-Tunnel-Checklist.md).

---

## Dev startup (Layout A-dev)

```powershell
# Terminal 1 — go2rtc
.\SomNet.Edge\scripts\start-go2rtc-windows.ps1

# Terminal 2 — edge agent
.\SomNet.Edge\scripts\start-edge-agent.ps1

# Terminal 3 — API (serves UI dist)
dotnet run --project SomNet.API
```

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial stub |
| 2026-09-12 | Phase 5 v1 — edge agent, token gateway, API snapshot trigger |
| 2026-09-12 | Fix — read video JWT claims from `JwtSecurityToken` payload (sub/jti mapping) |
| 2026-09-12 | Fix — snapshot trigger accepts device keys `stroke`/`burst`; capture in fresh DI scope |
| 2026-09-12 | V5-T1–T4 pass via API; V5-T5 pending UI stroke with device connected |
| 2026-09-12 | Fix — history sort/display uses `LastActivityAt` from latest snapshot |
| 2026-09-12 | V5-T5 pass; Phase 5 signed off → Phase 6 |
