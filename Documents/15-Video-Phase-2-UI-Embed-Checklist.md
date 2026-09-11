# Video — Phase 2 UI embed (dashboard iframes)

**Status:** **Blocked** — complete [Phase 1](./14-Video-Phase-1-Edge-Bench-Checklist.md) first

| Related | Link |
|---------|------|
| Architecture | [13-Video-And-Camera-Architecture.md](./13-Video-And-Camera-Architecture.md) |
| Frontend video components | [03-Frontend-Architecture.md](./03-Frontend-Architecture.md) — Video Components |
| Plan | [14-Video-Implementation-Plan.md](./14-Video-Implementation-Plan.md) |

**Goal:** Show **live front + rear** HLS feeds inside the SomNet dashboard (`DashboardLayout` / `VideoFeed` iframes) using **dev LAN URLs** from go2rtc (no session tokens yet).

**Explicitly out of scope:** Session-scoped tokens; tunnel; snapshots; pairing settings API; mobile expand default to front only (may include if trivial).

---

## Locked decisions (draft — lock before implementation)

| ID | Decision | Proposed choice |
|----|----------|-----------------|
| **V2-D1** | URL source v1 | Dev-only: `VITE_VIDEO_FRONT_URL` / `VITE_VIDEO_REAR_URL` env vars |
| **V2-D2** | Feed mapping | Monitor 1 = **front**, Monitor 2 = **rear** |
| **V2-D3** | Auth | None on iframe URL (LAN bench only); tokens in Phase 3 |
| **V2-D4** | CSP / mixed content | SomNet dev on `localhost`; go2rtc on `http://<pc-ip>:1984` — document operator must allow or use same host proxy |

---

## Implementation checklist

### UI

- [ ] Pass `videoSources` into `DashboardLayout` from manual + automatic mode views
- [ ] Read front/rear base URLs from env or dev config module
- [ ] Build iframe `src` (go2rtc `stream.html?src=front|rear` or custom embed from `SomNet.Edge`)
- [ ] Placeholder when URL unset (current behavior)

### Docs

- [ ] [03-Frontend-Architecture.md](./03-Frontend-Architecture.md) — videoSources wiring
- [ ] [08-Development-Guide.md](./08-Development-Guide.md) — env vars for local video

---

## Smoke tests

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **V2-T1** | Manual mode; both env URLs set | Front + rear play in dashboard monitors | ☐ |
| **V2-T2** | Mobile viewport | Feeds visible; expand overlay works | ☐ |
| **V2-T3** | Unset rear URL | Front plays; rear shows placeholder | ☐ |
| **V2-T4** | Stroke command (ESP32 optional) | Video unaffected; controls work | ☐ |

---

## Exit criteria

**V2-T1–T4** pass → start [Phase 3](./16-Video-Phase-3-Session-Tokens-Checklist.md).

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial stub |
