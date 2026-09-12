# Video — Phase 7 Pi production bench

**Status:** **Blocked** — complete [Phase 6](./19-Video-Phase-6-Tunnel-Checklist.md) first

> **Production target while IP on hold (V1-D11):** **Raspberry Pi 4/5 + 2× USB webcam** (Layout A-dev). No vendor cloud egress — video leaves the site only via SomNet session-scoped tunnel. Validate Pi can sustain dual V4L2 → HLS before treating this as the production edge.

| Related | Link |
|---------|------|
| Architecture | [13 — Edge hardware & cameras](./13-Video-And-Camera-Architecture.md#8-edge-hardware--camera-choices) |
| Active layout | [Phase 1 §4.4 A-dev](./14-Video-Phase-1-Edge-Bench-Checklist.md#44-stream-mapping) |
| Plan | [14-Video-Implementation-Plan.md](./14-Video-Implementation-Plan.md) |

**Goal:** Deploy go2rtc + edge agent to **Raspberry Pi 4/5** (8 GB validated); **Layout A-dev** (2× USB webcam); E2E with **ESP32** on LAN; local SomNet API.

**Explicitly out of scope (this phase):** Galayou IP / Thingino — **on hold** (V1-D9). Resume Layout A/B only if IP path unblocks later.

---

## Locked decisions

| ID | Decision | Choice | Date |
|----|----------|--------|------|
| **V7-D1** | Camera layout | **A-dev** — 2× USB webcam on Pi | 2026-09-11 |
| **V7-D2** | Why A-dev over IP | No vendor cloud tunnel; security = SomNet session tokens + tunnel only | 2026-09-11 |
| **V7-D3** | Pi model | Pi 4 or 5, 8 GB — validate dual-stream CPU/thermal soak | 2026-09-11 |

---

## Prerequisites

- [Phase 6](./19-Video-Phase-6-Tunnel-Checklist.md) tunnel working to dev PC
- Two USB webcams with adequate cable reach (or powered hub within ~3 m of Pi)
- Pi OS 64-bit; go2rtc arm64 binary or package
- ESP32 + Pi on same LAN as local SomNet API

---

## Implementation checklist

### Hardware

- [ ] Pi 4/5 with adequate PSU; Ethernet to LAN
- [ ] Front webcam (expression) + rear webcam (tool view) on USB ports or hub
- [ ] Confirm both devices in `v4l2-ctl --list-devices`

### go2rtc (Pi)

- [ ] Copy/adapt PC bench `go2rtc.yaml` — replace DirectShow `exec` with V4L2 sources
- [ ] Two streams: `front`, `rear` — H.264; 720p live acceptable for soak
- [ ] systemd unit for go2rtc; restart on failure

### Edge agent + tunnel

- [ ] Edge agent (Phase 5) on Pi — session hooks, token validation when enabled
- [ ] **Cloudflare Tunnel** on Pi — same pattern as [Phase 6](./19-Video-Phase-6-Tunnel-Checklist.md) (tunnel API or site hostname per Phase 8 split)

### E2E

- [ ] ESP32 paired; manual/automatic session on LAN API
- [ ] Operator sees distinct front + rear in dashboard via tunnel
- [ ] Command → ack → snapshot (Phase 4) from Pi edge

---

## Smoke tests

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **V7-T1** | Both V4L2 devices in go2rtc | `src=front` and `src=rear` play locally on Pi | ☐ |
| **V7-T2** | 24 h dual-stream soak | No go2rtc crash; CPU/temp acceptable; no thermal throttle | ☐ |
| **V7-T3** | Remote operator via tunnel | Front + rear distinct; session tokens enforced | ☐ |
| **V7-T4** | Full session with ESP32 | Command, ack, snapshot, history complete | ☐ |

---

## Exit criteria

- **V7-T1–T4** pass
- **V1-D11 validated** — Pi 4/5 + 2× USB webcam accepted as production edge while IP on hold
- → [Phase 8](./21-Video-Phase-8-Azure-Cutover-Checklist.md)

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial stub |
| 2026-09-11 | **V1-D11** — A-dev 2× USB on Pi as production target while IP on hold |
