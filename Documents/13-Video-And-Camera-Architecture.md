# Video & Camera Architecture

**Status:** Design + **Phases 1–4 implemented** (manual path) — tracked in [14-Video-Implementation-Plan.md](./14-Video-Implementation-Plan.md)

| Related | Link |
|---------|------|
| System context | [01-System-Overview.md](./01-System-Overview.md) |
| Dashboard video UI | [03-Frontend-Architecture.md](./03-Frontend-Architecture.md) — Video Components |
| Session events / history | [07-Session-And-History.md](./07-Session-And-History.md) |
| ESP32 / air-tool control | [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) — **no video path on device** |

---

## 1. Purpose

SomNet operators need **remote visibility** while controlling a session: two camera views (front and rear) help judge whether current settings are effective and what to do next. This document describes **how to get IP camera imagery to the browser** without routing live video through Azure or the ESP32.

**In scope:** camera ingest, remote delivery, action snapshots, cost-conscious hosting choices.

**Out of scope:** ESP32 firmware changes, SignalR protocol changes, detailed UI implementation checklists (those belong in frontend docs when work starts).

---

## 2. Operating constraints

These requirements drive every option below.

| Constraint | Implication |
|------------|-------------|
| Operator (browser) and device site are **not on the same LAN** | Cameras on a private network must be reached via the **internet** (tunnel or relay), not raw camera URLs |
| **Several seconds of delay is acceptable** | Low-latency WebRTC is optional; HLS or periodic stills are viable |
| **Store the resulting image of an action** | Snapshot-on-command-ack is a core feature, not an extra |
| **Keep Azure running costs low** | Live video must **not** egress through SomNet App Service; only small object uploads (JPEGs) and metadata |
| Operator needs enough detail to **steer session settings** | Front feed updated often; rear confirms physical outcome after actions |
| **Streaming preferred**; snapshot-only acceptable as fallback | Design primary and fallback modes with the same edge gateway |

---

## 3. Feed roles (asymmetric by design)

Front and rear are **different information channels**, not two equal monitors.

| Feed | Physical view | Operator question | Update rate |
|------|---------------|-------------------|-------------|
| **Front** (Monitor 1) | Device user expression / reaction | “How are they responding? Adjust power, pace, or stop?” | **Often and quickly** |
| **Rear** (Monitor 2) | Result of tool usage | “Did that stroke achieve the intended effect?” | **On each completed action** (slower live preview OK) |

**UI mapping (existing components):**

- `DashboardLayout` → Monitor 1 = front (primary, larger)
- Monitor 2 = rear (secondary, compact or “last result”)
- Mobile auto-expand should default to **front** (`monitor1`), not both — see [03-Frontend-Architecture.md](./03-Frontend-Architecture.md)

---

## 4. High-level architecture

Live video and snapshots stay **on-premises at the tool site**. Azure continues to host SomNet (sessions, auth, ESP32 commands). Only **small JPEG uploads** and URLs/metadata use Azure storage.

```
                         INTERNET
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
   SomNet (Azure)      Browser operator    Edge gateway
   · REST / SignalR    · SomNet UI         · Raspberry Pi 4/5
   · Session DB        · iframe viewers    · go2rtc or MediaMTX
   · Blob (JPEGs only)                     │
          │                                 ├── Front: USB webcam or RTSP
          │                                 ├── Rear: IP camera (RTSP)
          └──── ESP32 commands only ────────┤
                                            ├── HLS/MJPEG → tunnel → browser
                                            ├── Snapshot service
                                            └── Optional local MP4 archive
```

**ESP32:** air-tool control only — no camera or video workload.

**Edge gateway:** always required. Browsers cannot play RTSP; IP cameras are on a private LAN.

**Tunnel (e.g. Cloudflare Tunnel, Tailscale Funnel):** exposes HTTPS viewer URLs on the gateway to remote browsers **without** opening camera admin ports or pushing video through Azure App Service.

---

## 5. Operator experience & security

This section states what the **remote operator** should perceive and how access is protected. Implementation detail lives in §10 (session-scoped tokens) and §8 (edge hardware).

### Unified application feel

The operator uses **one SomNet web page** — the same dashboard as today:

| Element | Where it appears | Operator perception |
|---------|------------------|---------------------|
| Login, header, mode, sub | SomNet (Azure) | “The app” |
| Manual / automatic controls | SomNet dashboard | “The app” |
| Front + rear monitors | Embedded panels in dashboard (`VideoFeed` iframes) | “The app’s cameras” |
| Action outcome stills | Same page + session history / timeline | “The app’s record of what happened” |

Live video is loaded into existing monitor iframes via **session-scoped HTTPS URLs** (tunnel + token). The operator does **not** open a separate video site, second login, or pop-out player for normal use. Chrome-free embed pages on the edge (black background, no toolbar) keep the monitors visually consistent with the SomNet layout.

**Cross-origin note:** iframes load from the tunnel origin while the shell is SomNet — standard embed pattern (like maps or hosted players). The shell, session state, and controls remain fully SomNet.

### Session-scoped live access

Live streams exist **only during an active SomNet session**:

- **Session start** → API mints short-lived front/rear tokens → UI sets iframe URLs → edge begins publishing.
- **During session** → tokens refresh as needed (long automatic runs, browser refresh / rehydration).
- **Session end** (abort, stop, mode switch, sign-out, sub change) → tokens revoked → live panels stop → placeholders or last still shown.

No 24/7 public camera URLs. Idle site upload can be ~zero when the edge stops pulling cameras between sessions.

### Historical imagery (after live ends)

Each completed action (device ack) captures **encoded stills** (JPEG/WebP) to Azure Blob, linked to session events. After the session:

- Live streams are **gone**.
- History / timeline serves **stored images** via API + short-lived SAS — same dom/sub/session authorization as the rest of SomNet.

The permanent record is **photos per action**, not a continuous stream archive (optional local MP4 on edge is out of band).

### Security model (summary)

| Asset | Protection |
|-------|------------|
| **Live HLS** | HTTPS tunnel; **session-scoped signed tokens** (sessionId, dom, sub, feed, exp); revoked on session end |
| **Historical stills** | Private Blob; reads via JWT-checked API or short-lived SAS scoped to dom/sub/session. **Today (dev):** plain JPEG on disk + path metadata in SQL — **not encrypted at rest** ([future: snapshot encryption](#future-snapshot-encryption-at-rest)) |
| **Camera credentials** | Edge gateway only — never in React or operator-visible config |
| **Camera LAN** | Private network / VLAN; no port-forward of camera admin UI |
| **Vendor cloud / P2P** | **Block outbound** from IP cameras to vendor servers where possible; SomNet uses **LAN RTSP only** into edge (same model as Blue Iris) |
| **Tunnel** | **Operator-controlled** transport (Cloudflare / Tailscale on **Pi edge**) — not vendor app tunnels |
| **ESP32 / commands** | Unchanged — separate SignalR path; video failure does not block control |

**Residual risks:** a valid operator session can view what that account is authorized to see; leaked token works only until expiry or session end. Mitigate with short TTL, per-session tokens, and no long-lived stream URLs in settings.

### Future: snapshot encryption at rest

**Current (Phases 4–5, dev):** Action stills are **plain JPEG files** on disk (`data/snapshots/…`). SQL stores **metadata only** (`SessionActionSnapshots.RelativePath`, etc.) — **not** image blobs. Neither disk files nor DB rows are application-encrypted today. Access control is via SomNet JWT on `GET /api/video/snapshots/{id}/image`.

**Future requirement:** Add **encryption at rest** before production sign-off or as an early Phase 8 item so sensitive session imagery is not stored in plaintext:

| Layer | Target |
|-------|--------|
| **Files** | Encrypt JPEG/WebP on disk (dev) and in **Azure Blob** (production) — e.g. client-side envelope encryption before write, or platform SSE with customer-managed keys |
| **Database** | Keep blobs out of SQL where possible; if paths/keys remain in SQL, treat as sensitive metadata (TDE / Always Encrypted / encrypted key references) |
| **API** | Decrypt only when serving an authenticated, authorized request; no long-lived public URLs |

See [14 plan — Future enhancements](./14-Video-Implementation-Plan.md#future-enhancements-todo) · [Phase 4](./17-Video-Phase-4-Action-Snapshots-Checklist.md) · [Phase 8](./21-Video-Phase-8-Azure-Cutover-Checklist.md).

### Vendor camera cloud tunnels (Galayou / Wansview and similar)

Many consumer IP cameras (including **Galayou G2** via **Wansview Cloud**) maintain **persistent outbound connections** to vendor cloud infrastructure for app remote viewing — independent of RTSP. That path can carry video outside the LAN even when you intend local-only use.

**SomNet site policy (Layout A/B):**

| Layer | Policy |
|-------|--------|
| **Camera → internet** | **Block at router/firewall** (VLAN or egress rules) after one-time app setup; allow **LAN only** (RTSP to Pi/PC edge) |
| **Camera → edge** | **RTSP on LAN** — go2rtc on Pi ingests; credentials stay on edge |
| **Edge → operator** | **Session-scoped** HTTPS via **your** tunnel (Phase 6) — not vendor cloud |
| **Wansview app** | Setup tool only (Wi‑Fi, local account, enable RTSP); **not** the production video path |

Bench note (2026-09-11): operator blocked vendor tunnel URLs at router after Wireshark observation; RTSP to local go2rtc remains the intended feed path — aligns with prior **Blue Iris** LAN-only deployment.

**Preferred mitigation (Galayou IP cameras):** flash **[Thingino](https://thingino.com/)** — when IP path resumes. **Active (V1-D9–D11):** **IP on hold**; use **Layout A-dev** (2× USB webcam) — no vendor cloud; Pi 4 edge if dual-stream soak passes ([Phase 1](./14-Video-Phase-1-Edge-Bench-Checklist.md)).

### What we avoid (cost + security)

- Proxying live video through SomNet.API (Azure egress).
- Embedding camera passwords or permanent stream URLs in the UI bundle.
- Always-on streams without session binding.
- Relying on vendor mobile-app cloud tunnels for operator video.

---

## 6. Viable approaches (ranked by running cost)

Running cost is the primary sort key. Development complexity is noted but secondary.

### Option A — Snapshot-primary + front heartbeat *(lowest running cost)*

| Aspect | Detail |
|--------|--------|
| **How it works** | Edge captures JPEGs. **Front:** on every device ack + every 2–5 s while session active. **Rear:** on ack only (+ optional 1–2 s settle delay). UI polls or receives URLs via API; live `<img>` refresh or short polling interval. |
| **Azure cost** | **Minimal** — Blob storage + tiny API metadata only (~MB per session) |
| **Site upload** | **Low** — bursts of JPEGs, no continuous stream (~50–100 MB/hr active session) |
| **Remote access** | Tunnel optional (API/Blob URLs may suffice for images); tunnel still useful for direct edge fetch |
| **Operator experience** | Functional; less engaging than video; front feels “live enough” at 2–5 s refresh |
| **Dev complexity** | Moderate — edge capture agent + Blob upload + session event linkage |

**Best when:** upload bandwidth is tight or you want the smallest possible cloud bill.

---

### Option B — Asymmetric live stream (tunnel) + action snapshots *(recommended)*

| Aspect | Detail |
|--------|--------|
| **How it works** | Edge runs **go2rtc** or **MediaMTX**: RTSP in, HLS out. **Front:** 720p ~1–1.5 Mbps, shorter HLS segments (~2 s). **Rear:** 480p–720p ~0.5 Mbps slow stream *or* snapshot-between-actions only. On device ack, capture high-res JPEGs → Azure Blob → attach to session event. SomNet UI embeds tunnel HTTPS URLs in existing `VideoFeed` iframes. |
| **Azure cost** | **Low** — same as Option A for snapshots; **no** live video egress from App Service |
| **Site upload** | **Moderate** — ~400–600 MB/hr (asymmetric) vs ~1.5 GB/hr (symmetric 720p×2) |
| **Remote access** | **Cloudflare Tunnel** or **Tailscale Funnel** (free tiers often sufficient for single-operator use) |
| **Operator experience** | **Best balance** — live front expression + clear rear outcome stills |
| **Dev complexity** | Moderate — gateway stack + tunnel + snapshot hook on ack |

**Best when:** you want streaming for engagement while keeping Azure and recurring costs down. **Default recommendation.**

---

### Option C — Symmetric dual HLS via tunnel *(higher site cost, same Azure cost)*

| Aspect | Detail |
|--------|--------|
| **How it works** | Both cameras at 720p HLS through tunnel; snapshots on ack as in Option B. |
| **Azure cost** | Low (snapshots only) |
| **Site upload** | **High** — ~1–1.5 GB/hr |
| **Operator experience** | Excellent visually; wastes bandwidth on rear feed that changes slowly |
| **Dev complexity** | Similar to Option B |

**Best when:** upload bandwidth is plentiful and simplicity of “two identical streams” outweighs cost.

---

### Option D — Cloud video relay (Azure CDN, Media Services, third-party stream host)

| Aspect | Detail |
|--------|--------|
| **How it works** | Edge pushes RTSP/RTMP upstream; browser plays from cloud URL. |
| **Azure cost** | **High** — egress, compute, or SaaS fees scale with duration and resolution |
| **Site upload** | Full stream bitrate leaves the premises **and** cloud egress billed |
| **Operator experience** | Good remote access without tunnel per site |
| **Dev complexity** | High |

**Avoid for current goals** unless many concurrent viewers or centralized multi-site management is required later.

---

### Option E — WebRTC via tunnel *(lowest latency, unnecessary here)*

| Aspect | Detail |
|--------|--------|
| **How it works** | go2rtc WebRTC through tunnel; optional TURN for hard NAT. |
| **Azure cost** | Low if not using Azure for media |
| **Site upload** | Similar to Option B |
| **Operator experience** | Sub-second latency — **not needed** given multi-second evaluation workflow |
| **Dev complexity** | **Higher** than HLS (signaling, TURN, browser quirks) |

**Defer** unless latency requirements change.

---

### Summary comparison

| Option | Azure running cost | Site upload | Streaming | Action stills | Recommendation |
|--------|-------------------|-------------|-----------|---------------|----------------|
| **A** Snapshot-primary | ★ Lowest | ★ Lowest | No (refresh stills) | Yes | **Fallback / MVP** |
| **B** Asymmetric HLS + snapshots | ★ Low | ★★ Moderate | Front live, rear light | Yes | **Primary** |
| **C** Symmetric HLS | ★ Low | ★★★ High | Both live | Yes | Only if bandwidth cheap |
| **D** Cloud relay | ★★★ High | ★★★ High | Yes | Possible | **Avoid** |
| **E** WebRTC | ★ Low | ★★ Moderate | Yes | Separate | **Defer** |

---

## 7. Recommended stack (Option B)

| Layer | Suggested choice | Notes |
|-------|------------------|-------|
| Cameras | **A-dev (active):** 2× USB webcam — **A/B on hold:** webcam + IP or 2× IP | See §8; 720p–1080p live; 2K stills when IP resumes |
| Edge hardware | **Raspberry Pi 4/5** (8 GB OK for dev/prod test) | No Blue Iris or extra server; laptop prototype only |
| Ingest / restream | [go2rtc](https://github.com/AlexxIT/go2rtc) or MediaMTX | RTSP → HLS; optional WebRTC later |
| Remote HTTPS | Cloudflare Tunnel or Tailscale Funnel | No port-forward; not billed as Azure egress |
| Action snapshots | FFmpeg / camera ONVIF snapshot / go2rtc frame grab | Triggered on device ack |
| Durable storage | **Azure Blob Storage** | JPEGs only; link URLs in session events |
| SomNet integration | Minimal API extension | Store snapshot URLs on events; optional pairing settings for viewer base URLs |

**Explicit non-goals:**

- Do **not** proxy RTSP or HLS through SomNet.API
- Do **not** embed camera credentials in the React app
- Do **not** expose camera admin interfaces to the public internet

---

## 8. Edge hardware & camera choices

The edge gateway runs go2rtc (or similar), the tunnel client, snapshot upload, and session start/stop hooks. **Cameras do not connect directly to Azure or the browser.**

### Air tool site — working setup

Video at the device-user location is **separate from the ESP32** but part of the same install. The following is the **supported production configuration** for video feed functionality:

| Component | Required? | Role |
|-----------|-----------|------|
| **Raspberry Pi 4/5** | **Yes** (video) | Edge gateway — ingest, HLS, tunnel, snapshots, session hooks |
| **ESP32** | **Yes** (air tool) | Command / relay only — no video |
| **Cameras (one of two layouts)** | **Yes** (video) | See below |
| **Network + power** | **Yes** | Pi and IP camera(s) on LAN; PoE or adapters as needed |
| **Tunnel client** (on Pi) | **Yes** (remote operator) | Cloudflare Tunnel or Tailscale — software only |
| **Blue Iris / Windows NVR / extra PC server** | **No** | Pi pulls RTSP directly; no separate camera server for SomNet |

**Supported camera layouts** (both use Monitor 1 = front, Monitor 2 = rear):

| Layout | Front (expression) | Rear (tool result) | When to use |
|--------|--------------------|--------------------|-------------|
| **A-dev** *(active)* | **1× USB webcam** | **1× USB webcam** | **Current dev + preferred interim production** while IP on hold (V1-D9). No vendor cloud; Pi 4/5 if dual V4L2 soak passes (V1-D11). |
| **A** *(on hold)* | **1× USB webcam** on Pi | **1× IP camera** (RTSP) | Resume when Galayou/Thingino path works |
| **B** *(on hold)* | **1× IP camera** (RTSP) | **1× IP camera** (RTSP) | Uniform PoE; vendor cloud risk unless Thingino + WAN block |

**Security note (A-dev):** USB webcams have **no vendor cloud tunnel** — video stays LAN → Pi edge → SomNet session-scoped tunnel. This is why **Pi 4 + 2× USB** is preferred over blocked consumer IP cameras until a clean LAN-only path exists ([§5 vendor tunnels](#vendor-camera-cloud-tunnels-galayou--wansview-and-similar)).

**Resolution:** 2K-capable IP cameras are sufficient. Use **1080p H.264** for live HLS on the Pi; capture **2K stills** on action ack where the source allows (main stream or ONVIF snapshot).

**Dev / production testing:** Raspberry Pi 4 with **8 GB** RAM is validated for this role (headroom for go2rtc, tunnel, and snapshot upload).

### Development on PC vs production Pi

| Stage | Machine | Notes |
|-------|---------|-------|
| **Initial development / integration** | **Windows or Linux PC** | **Layout A-dev:** 2× USB webcam + go2rtc (active). IP cameras on hold. |
| **Bench test with ESP32** | PC or Pi | Same LAN as cameras and ESP32; proves end-to-end session → ack → snapshot. |
| **Production / tool-site install** | **Raspberry Pi 4/5** | Target deployment; match Pi before calling video signed off. |

**PC is fine** for building and testing the video pipeline and SomNet integration. **Use the Pi** before final tool-site sign-off — USB camera drivers, ARM paths, and 24/7 stability differ slightly from a dev PC. go2rtc config for a USB webcam differs by OS (DirectShow on Windows vs V4L2 on Pi/Linux); keep one “production” config template for the Pi.

**Early shortcut (optional):** With operator and PC on the **same LAN**, skip the tunnel temporarily and embed local HLS URLs in the UI to prove feeds in `VideoFeed` iframes — add tunnel + session tokens once basic streaming works.

```
  [ESP32] ── Wi‑Fi ──► Azure (commands)

  Layout A-dev (active)            Layout A / B (on hold)
  [USB front]──►┐                  [IP or USB mix]──RTSP──►┐
  [USB rear]───►┼──► [Pi 4/5] ── tunnel ──► operator browser
                ┘                  [IP rear]──────────────►┘
```

### Edge computer: Raspberry Pi vs PC

| Factor | Raspberry Pi 4/5 *(recommended)* | PC / laptop | Small NUC / mini PC |
|--------|----------------------------------|-------------|---------------------|
| **Running cost** | ~3–8 W; low electricity | 30–100+ W | ~10–25 W |
| **24/7 duty** | Designed for always-on | Laptop poor; desktop OK | Good |
| **1080p × 2 passthrough HLS** | Yes (H.264 from cameras) | Easy | Easy |
| **4K or heavy transcode** | Marginal; prefer 1080p or NUC | Comfortable | Comfortable |
| **Upfront cost** | Low | Often already owned | Medium |
| **Reliability** | SD card — use SSD boot / USB SSD | Familiar | Best for heavy use |

**Recommendation:** **Raspberry Pi 4 (4 GB+; 8 GB for dev/prod testing) or Pi 5** — the only supported edge computer for air tool site video (see **working setup** above). A **NUC or mini PC** is an exceptional alternative only if 4K transcode is unavoidable. A **laptop** is bench/prototype only — not production.

### Camera layout detail (layouts A & B)

Both supported layouts feed the **same** go2rtc → HLS → session-token pipeline.

#### Layout A-dev — Two USB webcams *(active)*

| Feed | Camera | Notes |
|------|--------|-------|
| Front | USB webcam | Close-up expression; 720p live |
| Rear | USB webcam | Tool / bench view; mount with USB reach (~3 m hub if needed) |

go2rtc ingests **two V4L2** devices on Pi (or DirectShow on Windows dev PC). **No RTSP, no vendor cloud.**

#### Layout A — USB webcam + IP camera *(on hold)*

| Feed | Camera | Notes |
|------|--------|-------|
| Front | USB webcam on Pi | Close-up expression; 720p–1080p live |
| Rear | IP camera (RTSP / ONVIF) | Resume when V1-D9 unblocked |

#### Layout B — Two IP cameras *(on hold)*

| Feed | Camera | Notes |
|------|--------|-------|
| Front | IP camera (RTSP / ONVIF) | Mount facing device user; PoE simplifies wiring |
| Rear | IP camera | Wider shot of tool / result area |

Uniform PoE install; no USB cable limit on front.

### Source → go2rtc mapping (mixed example)

```yaml
# Illustrative go2rtc.yaml — front USB, rear RTSP
streams:
  front:
    - ffmpeg:device?video=0#video=h264  # or v4l2 / driver-specific
  rear:
    - rtsp://rear-cam.local/stream1
```

Snapshot and HLS outputs use the same stream names (`front`, `rear`) regardless of physical camera type.

### Camera selection tips

| Requirement | Guidance |
|-------------|----------|
| **Codec** | H.264 from camera (or USB cam + light encode on Pi) — avoids heavy Pi transcode |
| **Front resolution** | 720p–1080p live; higher-res still on ack if source allows frame grab |
| **Rear resolution** | 1080p live; **2K still** on ack when camera supports it |
| **2K IP cameras** | Substream 1080p H.264 for live; main stream / snapshot for action stills |
| **NVR (e.g. Blue Iris)** | **Not required** — Pi connects to cameras directly |
| **Lighting** | Front (face) benefits more from stable lighting than rear |
| **Privacy / physical** | Front webcam: operator-only session-scoped access ([§5](#5-operator-experience--security), [§10](#10-session-scoped-streaming-recommended-security-model)) |

Hardware decisions **H1–H6** are recorded in [§14](#14-decision-record).

---

## 9. Snapshot timing and session linkage

Snapshots should align with **device command acknowledgment** (stroke/burst complete), not button press.

```
Operator sends command → ESP32 executes → device ack → API updates session
                                              │
                                              └── API ack hook triggers (Phase 5):
                                                    · front JPEG (immediate) — **optional** (`appOptions.actionSnapshotFeeds`: `both` default, `rear` skips front)
                                                    · rear JPEG (+1–2 s settle, optional; always when rear-only mode)
                                                    · upload to Blob (production) / local disk (dev)
                                                    · DB row per feed (`SessionActionSnapshots`)
```

**Between actions:** front-only heartbeat (2–5 s) while session is active; rear holds “last result” until next ack.

**Trigger (implemented — Phase 5):** API **`VideoActionSnapshotTrigger`** after successful hardware ack (`POST /api/devices/commands`). **Feed selection:** **Options → General** `actionSnapshotFeeds` — `both` (front + rear) or `rear` only (skips front when stream delay makes expression stills less useful). Persisted per dom/sub in pairing `appOptions`.

**Deferred alternatives:** edge SignalR observer (no API dependency if UI closes mid-capture).

---

## 10. Session-scoped streaming (recommended security model)

Live video uses **token-based access tied to an active SomNet session**. Streams are **not** available 24/7. When the session ends, live URLs stop working; **encoded still images** captured during the session remain in Blob for historical review.

Operator-facing behavior and security summary: **§5**. Edge and camera choices: **§8**.

### Lifecycle

```
Session start (POST /api/sessions or first manual action)
  │
  ├─► API notifies edge: session_started { sessionId, dom, sub }
  ├─► Edge enables HLS publish (cameras → go2rtc) for this pairing
  ├─► API issues short-lived stream tokens (front + rear)
  └─► UI sets VideoFeed iframe src = tunnel viewer URL ?token=...

During session
  │
  ├─► Each device ack → capture JPEG/WebP → Blob → link to session event
  ├─► Token refresh before expiry (long automatic runs)
  └─► Live HLS continues only while session active

Session end (abort, stop, mode switch, sign-out, sub change)
  │
  ├─► API notifies edge: session_ended { sessionId }
  ├─► Edge revokes tokens / stops accepting stream requests
  ├─► Optional: stop RTSP pull to save site bandwidth when idle
  └─► Live iframes fail gracefully; UI shows last still or placeholder
      Historical images remain queryable via API / session timeline
```

### Token design

Tokens are issued by **SomNet.API** after operator JWT validation — not generated on the edge alone.

| Claim / field | Purpose |
|---------------|---------|
| `sessionId` | Bind stream to one session |
| `dom`, `sub` | Match pairing scope |
| `feed` | `front` \| `rear` — separate tokens per feed |
| `exp` | Short TTL (e.g. 15–30 min); refresh while session active |
| `jti` | Unique id for revocation list on session end |

Edge gateway (or tunnel worker) validates signature with a **shared secret** or public key from API. Invalid, expired, or revoked token → **403**, no video.

**On session end:** API adds `jti` (or session id) to a revocation list pushed to edge, or edge polls a lightweight `GET /api/video/sessions/{id}/active` endpoint.

### Live vs historical (two channels, one session)

| Kind | When available | Storage | Access |
|------|----------------|---------|--------|
| **Live stream** | Only during active session | Edge ( ephemeral HLS segments ) | Session-scoped stream token |
| **Action snapshot** | Captured on each ack during session | Azure Blob (JPEG/WebP) | Session-scoped SAS or API proxy; readable after session ends |

Historical review uses **stored images** linked to session events — not replay of live stream. Optional later: session-end composite or thumbnail strip in timeline ([07-Session-And-History.md](./07-Session-And-History.md)).

**Encoding:** JPEG or WebP at high quality for rear outcome; front may use slightly lower file size for heartbeats. Store `contentType`, `capturedAt`, `feed`, `sessionEventIndex` (or command id) in DB alongside Blob path.

### Security benefits

- No always-on public camera URL — attack surface exists only during sessions.
- Leaked URL expires with token and becomes useless after session end.
- **Idle site upload ~zero** if edge stops pulling RTSP when no session is active.
- Sensitive imagery retained only where access is gated (private Blob + API), not on an open stream endpoint.

### Integration with session lifecycle

Align with existing start/end triggers in [07-Session-And-History.md](./07-Session-And-History.md):

| Event | Video action |
|-------|----------------|
| Manual first stroke / automatic Start | Start session → enable streams → issue tokens |
| Browser refresh with active session | Rehydration → re-issue tokens if session still open |
| Each stroke/burst ack | Capture + upload historical stills |
| Session end (any reason) | Revoke tokens → disable live streams |
| History / timeline view | Serve Blob URLs only; no live token |

Video failure must **not** block session control (ESP32 path independent).

---

## 11. Rough running-cost estimates

Assumes one operator, one site, ~30-minute active session. Azure = Blob + existing App Service/SQL (unchanged tier).

| Mode | Azure incremental | Site upload (30 min) | Tunnel / other |
|------|-------------------|----------------------|----------------|
| A — Snapshot-primary | **< $0.01** storage | ~25–50 MB | $0 (Cloudflare free tier) |
| B — Asymmetric HLS + snapshots | **< $0.05** storage | ~200–300 MB | $0 tunnel |
| C — Symmetric HLS | **< $0.05** storage | ~750 MB–1 GB | $0 tunnel |
| D — Cloud relay | **$5–50+/mo**+ depending on service | ~750 MB–1 GB up | SaaS fees |

*JPEG estimate: ~200 actions × 2 cameras × ~400 KB ≈ 160 MB stored per long session (optional lifecycle policy to delete after N days).*

---

## 12. Fallback behavior

If tunnel or front HLS fails mid-session:

1. Switch UI to **snapshot-primary mode** (Option A) automatically or via app option.
2. Continue command path (ESP32 / SignalR) — video failure must not block control.
3. Show last known front/rear stills with timestamp and “feed unavailable” on live panels.

Same edge gateway serves both primary and fallback; only delivery policy changes.

---

## 13. SomNet touchpoints

Light coupling only — no new firmware phase.

| Area | Status | Detail |
|------|--------|--------|
| **Pairing settings** | **Partial** | `video.tunnelBaseUrl` per dom/sub (empty → same-origin `/go2rtc`). **`appOptions.mobileVideoExpandDefault`** (`both` \| `monitor1` \| `monitor2`) — **live** iframe gating ([Phase 6 V6-D17](./19-Video-Phase-6-Tunnel-Checklist.md)). **`appOptions.actionSnapshotFeeds`** (`both` \| `rear`) — **stills** on ack only. **Future:** installer config via ESP32/edge UI ([14 plan — Future enhancements](./14-Video-Implementation-Plan.md#future-enhancements-todo)). Bench: `VITE_VIDEO_FRONT_URL` gates video feature; iframe `src` from session tokens. |
| **Session start/end** | **Partial** | Mint tokens on feed show; revoke on `POST …/end` ([Phase 3](./16-Video-Phase-3-Session-Tokens-Checklist.md)). Edge agent notify on start/end → [Phase 5](./18-Video-Phase-5-Edge-Agent-Checklist.md). |
| **API** | **Partial** | `POST /api/video/sessions/{sessionId}/tokens`; snapshot capture/list/image ([Phase 4](./17-Video-Phase-4-Action-Snapshots-Checklist.md)). Edge webhook on ack → Phase 5. |
| **Action snapshots** | **Done (manual v1)** | `SessionActionSnapshots` table — `sessionId`, `actionIndex`, `feed`, disk path, `capturedAt`. Configurable feeds via `actionSnapshotFeeds`. **Not** stored on session event rows. |
| **UI** | **Partial** | `useSessionVideoSources` — tokens, feed timeouts, live feed gating, Start feed(s) preview, F5 restore hints. History: `SessionSnapshotGallery`. Automatic snapshots deferred. |
| **Azure** | **Future** | Blob container + lifecycle rule; no App Service video egress ([Phase 8](./21-Video-Phase-8-Azure-Cutover-Checklist.md)). |

See [07-Session-And-History.md](./07-Session-And-History.md) — history dialog loads snapshots via video API, not session event fields.

---

## 14. Decision record

| ID | Decision | Choice | Rationale |
|----|----------|--------|-----------|
| V1 | Video path separate from ESP32 | **Yes** | Device has no compute for RTSP/transcode |
| V2 | Live video through Azure App Service | **No** | Egress cost and complexity |
| V3 | Primary delivery | **Asymmetric HLS via tunnel (Option B)** | Best UX per dollar; delay acceptable |
| V4 | Fallback | **Snapshot-primary (Option A)** | Same gateway; lowest cost |
| V5 | Front vs rear priority | **Front frequent, rear on action** | Matches operator decision workflow |
| V6 | Durable action record | **JPEG/WebP to Blob on ack** | Cheap, clear, timeline-friendly |
| V7 | Low-latency WebRTC | **Defer (Option E)** | Not required for multi-second evaluation |
| V8 | Live stream availability | **Session-scoped tokens only** | Minimize exposure; no 24/7 streams |
| V9 | Post-session imagery | **Blob + session event links** | History without keeping live feeds open |
| H1 | Air tool site video computer | **Raspberry Pi 4/5 only** | Single edge gateway; no separate camera server |
| H2 | Supported camera layouts | **A: 1× webcam + 1× IP** *(default)* **or B: 2× IP** | Only production layouts for video feeds |
| H3 | NVR / Blue Iris / extra PC | **Not required** | Pi pulls RTSP directly from IP camera(s) |
| H4 | Pi RAM (dev / prod test) | **Pi 4 8 GB validated** | Sufficient headroom for go2rtc + tunnel |
| H5 | Laptop as production gateway | **Avoid** | Prototype / bench only |
| H6 | Initial dev / integration host | **PC OK** | Pi required for production sign-off, not first dev |
| D1 | Azure before camera / full system ready | **No** | Local API/UI until end-to-end dev complete |
| V10 | IP camera path (Galayou) | **On hold** (V1-D9); Thingino if resumed | Vendor cloud tunnel risk |
| V11 | Active camera layout | **A-dev** 2× USB webcam; **Pi 4/5** production target while IP on hold | No vendor egress; SomNet session tunnel only |
| V12 | Action snapshot feeds | **Operator-configurable** (`both` \| `rear`) via `appOptions.actionSnapshotFeeds` | Stream delay makes front stills less useful; rear outcome is primary record |
| V13 | Live video feed count | **Operator-configurable** (`both` \| `monitor1` \| `monitor2`) via `appOptions.mobileVideoExpandDefault` | Single feed on poor mobile/tunnel links; separate from snapshot feeds ([Phase 6](./19-Video-Phase-6-Tunnel-Checklist.md)) |

---

## 15. Deployment order — local first, Azure last

SomNet and video integration should be developed **entirely on the PC** (and LAN) before paying for or depending on Azure hosting. **Camera work does not require Azure** — live video never transits App Service; only action snapshots use Blob in production.

### Local development stack (now → until system ready)

| Component | Local approach | Azure needed? |
|-----------|----------------|---------------|
| **SomNet API + UI** | [Development Guide](./08-Development-Guide.md) — `localhost:5031` / Vite proxy | **No** |
| **Database** | SQL LocalDB (`data/SomNet.mdf`) | **No** |
| **ESP32 commands** | Device server URL → PC LAN IP (e.g. `http://<pc-ip>:5031`) | **No** |
| **go2rtc + cameras** | Same PC (see §8 — PC dev) or Pi on LAN | **No** |
| **Live feeds in UI** | Local or tunneled HLS URLs → `VideoFeed` iframes | **No** |
| **Session stream tokens** | Implement in **local API** | **No** |
| **Action snapshot storage** | Local disk path or [Azurite](https://github.com/Azure/Azurite) Blob emulator | **No** (real Blob later) |

All camera pipeline work (go2rtc, tunnel, token minting, UI wiring, ack → snapshot) can be built and tested against the **local SomNet stack**.

### Optional: remote operator testing without Azure

To simulate an operator **not on the tool-site LAN** before Azure deployment:

- Run **Cloudflare Tunnel** or **Tailscale Funnel** to the **dev PC** for SomNet (API/UI) **and** for go2rtc — same pattern as production video.
- Still **no** App Service, Azure SQL, or Azure Blob charges — only free-tier tunnel software on the PC.

### When to deploy to Azure

Move to Azure in **one deliberate cutover** (or short sequence) when local end-to-end is stable:

- ESP32 pairing and commands reliable
- Sessions, rehydration, multi-tab sync signed off (existing UI work)
- Video: feeds in dashboard, session-scoped tokens, snapshots on ack (even if Blob still emulated locally)

| Azure resource | Purpose | Notes |
|----------------|---------|-------|
| **App Service** (or container) | Host API + static UI | Replace LAN URL; ESP32 server URL updated to production |
| **Azure SQL** | Production database | Migrate from LocalDB |
| **Azure Blob** | Durable action JPEGs/WebP | Replace Azurite / local folder; lifecycle rules |
| **Azure SignalR Service** | Optional | Only if scale-out needed — not required for first deploy |

Live HLS **still does not** route through App Service after Azure deploy — edge Pi (or interim PC) + tunnel unchanged.

### Suggested timeline

```
Phase 1 — Local (no Azure cost)
  · Local API/UI + LocalDB
  · ESP32 → LAN API
  · PC: go2rtc, cameras, iframe embed
  · API: session tokens, snapshot hooks (local/Azurite storage)

Phase 2 — Local + tunnel (still no Azure hosting)
  · Tunnel to dev PC for remote operator + video testing

Phase 3 — Tool-site hardware
  · Move go2rtc + tunnel to Raspberry Pi (Layout A-dev; A/B when IP resumes)
  · ESP32 + Pi at install location; API still local or Azure depending on readiness

Phase 4 — Azure production (when fully developed)
  · Deploy API/UI + SQL + Blob
  · Point ESP32 and pairing settings at production URL
  · Edge Pi tunnel URLs in pairing settings
```

**Pi at tool site** (Phase 3) is independent of Azure — site hardware can be validated while SomNet still runs locally, or after Azure cutover.

### Explicit non-goals during local dev

- Do **not** deploy App Service early “just for cameras” — unnecessary cost and complexity.
- Do **not** stream video through Azure to prove camera integration.
- Do **not** block camera work on Azure Blob — use disk or Azurite until cutover.

See [08-Development-Guide.md](./08-Development-Guide.md) for local ports and ESP32 LAN profile.

---

## 16. Implementation checklists

Architecture and hardware choices live in this document. **Phased implementation** is tracked separately:

| Doc | Phase | Status |
|-----|-------|--------|
| [14-Video-Implementation-Plan.md](./14-Video-Implementation-Plan.md) | Roadmap | **Phase 6 signed off** (2026-09-13); Phase 7 next |
| [14-Video-Phase-1-Edge-Bench-Checklist.md](./14-Video-Phase-1-Edge-Bench-Checklist.md) | 1 — go2rtc on PC | **Partial sign-off** (Layout A-dev) |
| [15-Video-Phase-2-UI-Embed-Checklist.md](./15-Video-Phase-2-UI-Embed-Checklist.md) | 2 — dashboard iframes | **Complete** |
| [16-Video-Phase-3-Session-Tokens-Checklist.md](./16-Video-Phase-3-Session-Tokens-Checklist.md) | 3 — API tokens | **Signed off** (T4 deferred) |
| [17-Video-Phase-4-Action-Snapshots-Checklist.md](./17-Video-Phase-4-Action-Snapshots-Checklist.md) | 4 — snapshots (local) | **Signed off** (manual v1) |
| [18-Video-Phase-5-Edge-Agent-Checklist.md](./18-Video-Phase-5-Edge-Agent-Checklist.md) | 5 — edge agent | **Signed off** (2026-09-12) |
| [19-Video-Phase-6-Tunnel-Checklist.md](./19-Video-Phase-6-Tunnel-Checklist.md) | 6 — remote operator | **In progress** (PC smoke) |
| [20-Video-Phase-7-Pi-Production-Checklist.md](./20-Video-Phase-7-Pi-Production-Checklist.md) | 7 — Pi + ESP32 E2E | Blocked (Phase 6) |
| [21-Video-Phase-8-Azure-Cutover-Checklist.md](./21-Video-Phase-8-Azure-Cutover-Checklist.md) | 8 — Azure deploy | Blocked (Phase 7) |

Sample edge config: [`SomNet.Edge/`](../SomNet.Edge/README.md).

---

## 17. References

- go2rtc — RTSP/WebRTC/HLS gateway: https://github.com/AlexxIT/go2rtc  
- MediaMTX — RTSP/HLS server: https://github.com/bluenviron/mediamtx  
- Cloudflare Tunnel — https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/  
- Tailscale Funnel — https://tailscale.com/kb/1223/tailscale-funnel  
