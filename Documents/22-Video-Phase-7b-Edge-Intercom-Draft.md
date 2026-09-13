# Video — Phase 7b Edge intercom (draft)

**Status:** **Draft / not scheduled** — explore after [Phase 7 — Pi production](./20-Video-Phase-7-Pi-Production-Checklist.md) video path is signed off on the Pi. **Not** a blocker for Phase 7 or [Phase 8 — Azure cutover](./21-Video-Phase-8-Azure-Cutover-Checklist.md).

| Related | Link |
|---------|------|
| Architecture | [13 — Video & camera architecture](./13-Video-And-Camera-Architecture.md) |
| Plan | [14 — Video implementation plan](./14-Video-Implementation-Plan.md) |
| Tunnel + tokens | [Phase 6](./19-Video-Phase-6-Tunnel-Checklist.md) · [Phase 3 tokens](./16-Video-Phase-3-Session-Tokens-Checklist.md) |
| go2rtc bench | [Phase 1 — Edge bench](./14-Video-Phase-1-Edge-Bench-Checklist.md) |

---

## Problem statement

Remote operators watch **session-scoped live video** through the SomNet dashboard (MSE over HTTPS tunnel). In most deployments, **voice coordination already happens on a normal phone call** between operator and someone at the tool site.

This draft asks whether **optional built-in audio** (listen-in and/or talk-back) should live **inside SomNet** on the **Pi edge gateway**, using a **USB headset** (mic + headphones) at the site — without replacing the phone as the primary comms channel.

---

## Product stance (recommended)

| Channel | Role |
|---------|------|
| **Regular phone call** | **Primary** operator ↔ site coordination — reliable, familiar, low engineering risk |
| **SomNet built-in audio** | **Optional supplement** — “I’m already in the dashboard watching; I don’t want to dial a second device” |

Built-in audio is **nice-to-have**, not required for production sign-off. Implement only if a concrete workflow benefit appears after Phase 7 (e.g. single-screen remote supervision without juggling phone + browser).

---

## What we will **not** do (guardrails)

1. **Do not replace MSE video** with WebRTC for the main camera iframes — [Phase 6](./19-Video-Phase-6-Tunnel-Checklist.md) proved **MSE + Cloudflare tunnel** for dual webcam feeds; changing viewer mode for all monitors is high regression risk ([architecture V7 — WebRTC deferred](./13-Video-And-Camera-Architecture.md#14-decision-record)).
2. **Do not merge intercom into webcam `-an` ffmpeg lines** — comms audio should use a **dedicated Pi headset source**, not the Anker/front webcam mic (poor placement, no reliable talk-back path).
3. **Do not assume always-on microphone** at the site — default **Off**; session-scoped; consider push-to-talk and visible “mic live” indicator for privacy.

---

## Architecture sketch (video unchanged)

```
Remote operator (browser, HTTPS tunnel)
        │
        ├─► /go2rtc/stream.html?src=front|rear&mode=mse&token=…   ← unchanged (video)
        │
        └─► /go2rtc/stream.html?src=intercom&mode=webrtc&media=audio+microphone&token=…
                                    │
                                    ▼
                         go2rtc on Pi (localhost:1984)
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
            USB headset mic (ALSA)          USB headset headphones
            site → operator (listen-in)     operator → site (backchannel)
```

**Principle:** **One transport stack per job** — MSE for **video**, WebRTC for **audio/intercom only** (when implemented). Same API `/go2rtc` proxy and **session stream tokens** as video.

---

## Latency — the main technical risk

| Path | Typical latency | SomNet use |
|------|-----------------|------------|
| **MSE video** (current) | ~1–3 s acceptable per [architecture §1](./13-Video-And-Camera-Architecture.md) | Visual monitoring — OK |
| **WebRTC audio** (intercom target) | ~100–300 ms one-way | Conversation — needs to feel “phone-like” |
| **Phone call** (PSTN/VoLTE) | ~150–400 ms | Already good enough for most workflows |

**Risk:** Tunnel + WebRTC (UDP/TCP, optional TURN) may add jitter or failure modes MSE does not have. **Mitigation:** prototype **audio-only WebRTC** on Pi **before** any UI commitment; measure mouth-to-ear delay on LAN, then through Cloudflare tunnel.

**Acceptance idea (if pursued):** one-way listen-in ≤ ~1 s; push-to-talk round-trip ≤ ~500 ms on LAN; tunnel round-trip documented separately (may be worse than phone — that’s OK if product position stays “supplement”).

---

## Feature tiers (implement in order)

### Tier 1 — Listen-in (site → operator)

- Pi USB headset **microphone** → go2rtc stream (e.g. `intercom` or `floor`).
- Operator hears site audio in dashboard; **no browser mic** required.
- May work with **MSE** for playback-only (go2rtc codec repackaging) — **lower risk** than full WebRTC.
- **Use case:** ambient confirmation while watching video (“machine running”, someone at bench).

### Tier 2 — Push-to-talk (operator → site)

- Browser **microphone** → Pi headset **speaker** via go2rtc **exec backchannel** ([go2rtc exec docs](https://github.com/AlexxIT/go2rtc/blob/master/internal/exec/README.md)).
- Requires **`mode=webrtc`** and `media=audio+microphone` on the **intercom** embed only.
- UI: **Hold to talk** (default) — avoids hot-mic and echo.
- **Use case:** “Stop”, “ready for next stroke”, brief coaching without opening the phone app.

### Tier 3 — Full duplex intercom

- Always-on or automatic half-duplex.
- **Highest complexity** — echo, feedback, privacy, tunnel WebRTC reliability.
- **Defer** unless Tier 2 proves insufficient and phone handoff is unacceptable.

---

## Pi hardware (production)

| Device | Role |
|--------|------|
| **2× USB webcam** | Video only (unchanged Layout A-dev) |
| **1× USB headset** (mic + headphones) | Comms only — ALSA `plughw:x,0` |
| **Pi 4/5** | go2rtc + ffplay/aplay for backchannel |

Bench on PC (DirectShow) is possible for dev; **sign-off on Pi** only.

---

## go2rtc config (illustrative — not committed)

Video streams stay as today (`-an` or video-only V4L2). **Separate** stream name, e.g.:

```yaml
streams:
  # Video — unchanged
  front: …
  rear: …

  # Phase 7b draft — intercom (Pi ALSA + backchannel)
  intercom:
    # Site mic → operators (listen-in)
    - exec:ffmpeg -hide_banner -f alsa -i plughw:1,0 -c libopus -application voip -f opus -
    # Operator voice → Pi headphones (talk-back; codec must match WebRTC negotiation)
    - exec:ffplay -nodisp -probesize 32 -f alaw -ar 8000 -i -#backchannel=1#audio=alaw/8000
```

Exact ALSA device index and codec params require Pi bench tuning. See go2rtc **two-way audio** notes: HTTPS required for browser mic (tunnel satisfies this).

---

## SomNet integration (future — if tier 1+ approved)

| Area | Idea |
|------|------|
| **Options → General** | `intercomMode`: `off` \| `listen` \| `pushToTalk` (default `off`) |
| **Tokens** | Extend or parallel mint for `feed=intercom`; same gateway middleware |
| **UI** | Small **Intercom** panel — mute, PTT button, level meter; **not** inside camera iframes |
| **Session gating** | Audio only while session active (same as video) |
| **Edge agent** | Optional hook to verify ALSA device present on session start |

No API/UI work until Pi **Tier 1** smoke passes.

---

## Comparison: built-in vs phone

| | **Phone call** | **SomNet intercom** |
|--|----------------|----------------------|
| Reliability | High (carrier) | Depends on tunnel + WebRTC |
| Latency | Good | Must be measured; may lose to phone on LTE |
| UX | Second device / handoff | Single dashboard |
| Privacy | External to SomNet | Must design (PTT, indicators, logging policy) |
| Engineering | None | Pi ALSA, go2rtc, WebRTC, UI, tests |

**Conclusion:** Phone remains **default**. Built-in audio is justified only when **single-screen remote ops** is a recurring, paid-for requirement.

---

## Draft decisions (not locked)

| ID | Draft decision | Proposed choice |
|----|----------------|-----------------|
| **V7b-D1** | Primary voice channel | **Phone** — built-in optional |
| **V7b-D2** | Video viewer mode | **Keep MSE** for front/rear |
| **V7b-D3** | Intercom transport | **WebRTC audio-only** stream (separate iframe) |
| **V7b-D4** | Site audio hardware | **USB headset on Pi**, not webcam mic |
| **V7b-D5** | Default operator UX | **Off**; Tier 1 listen-in first; Tier 2 PTT before duplex |
| **V7b-D6** | Latency gate | Prototype + measure before UI; abort if tunnel RTT worse than phone with no UX win |

---

## Prerequisites (before any implementation checklist)

- [ ] [Phase 7](./20-Video-Phase-7-Pi-Production-Checklist.md) **video** signed off on Pi (go2rtc V4L2, tunnel, tokens, ESP32 E2E)
- [ ] USB headset stable on Pi ALSA (record + playback loopback test)
- [ ] go2rtc Tier 1 listen-in on Pi LAN (no SomNet UI)
- [ ] go2rtc Tier 2 PTT on Pi LAN (`webrtc.html` or equivalent bench page)
- [ ] Same Tier 1–2 through **Cloudflare tunnel** with latency notes

---

## Open questions

1. Is **listen-in alone** enough (no talk-back), given phone covers talk-back today?
2. Should intercom be **Dom-only** (logged-in operator) or also audible to **Sub** at site through the Pi headset only?
3. Record intercom for session history / compliance — **default no**?
4. Does Cloudflare tunnel need **TURN** or `webrtc/tcp` for operator networks that block UDP?

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-13 | Initial draft — post Phase 6; phone primary; MSE video unchanged; latency as main risk |
