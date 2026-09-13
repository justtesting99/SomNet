# Video — Phase 7 Pi production bench

**Status:** **Next** — [Phase 6](./19-Video-Phase-6-Tunnel-Checklist.md) signed off (2026-09-13). Optional [Phase 7b intercom](./22-Video-Phase-7b-Edge-Intercom-Draft.md) is **out of scope** until Pi video is signed off.

> **Production target while IP on hold (V1-D11):** **Raspberry Pi 4/5 + 2× USB webcam** (Layout A-dev) in a **standalone box** at the tool site. No vendor cloud egress — live video leaves the site only via **SomNet session-scoped tunnel** on the Pi. Validate dual V4L2 → **MSE** (`mode=mse`) before treating this as the production edge.

| Related | Link |
|---------|------|
| Architecture | [13 — Edge hardware & cameras](./13-Video-And-Camera-Architecture.md#8-edge-hardware--camera-choices) |
| Active layout | [Phase 1 §4.4 A-dev](./14-Video-Phase-1-Edge-Bench-Checklist.md#44-stream-mapping) |
| Plan | [14-Video-Implementation-Plan.md](./14-Video-Implementation-Plan.md) |
| Phase 6 (PC tunnel) | [19 — Tunnel checklist](./19-Video-Phase-6-Tunnel-Checklist.md) |
| Azure cutover | [21 — Phase 8](./21-Video-Phase-8-Azure-Cutover-Checklist.md) |
| Edge README | [`SomNet.Edge/README.md`](../SomNet.Edge/README.md) |

**Goal:** Deploy **go2rtc + edge agent + Cloudflare tunnel** to **Raspberry Pi 4/5** (8 GB validated); **Layout A-dev** (2× USB webcam); E2E with **ESP32** on LAN. **SomNet API stays on dev PC** for Phase 7 bench; production moves API to **Azure** in [Phase 8](./21-Video-Phase-8-Azure-Cutover-Checklist.md).

**Explicitly out of scope (this phase):** Galayou IP / Thingino — **on hold** (V1-D9). Full Azure deploy (Phase 8). Options UI editor for `tunnelBaseUrl` (installer sets pairing JSON). Resume Layout A/B only if IP path unblocks later.

---

## Production target (shipped box)

Each air-tool site receives a **Pi + ESP32 kit**. After provisioning the box is **headless** (no monitor) and needs **internet only** — Ethernet preferred.

```
                    ┌─────────────────────────────────┐
                    │  Azure — SomNet API + UI + SQL   │  ← Phase 8
                    │  (multi-user cloud)              │
                    └───────────┬─────────────────────┘
                                │
         HTTPS (app)            │  SignalR / REST
         ┌──────────────────────┼──────────────────────┐
         │                      │                      │
         ▼                      ▼                      ▼
   Web operator            ESP32 (in box)         Pi (in box)
   (browser)               server_url = cloud      go2rtc + edge agent
                           NOT Pi                  + cloudflared (outbound)
```

| Component | Production role |
|-----------|-----------------|
| **Azure API + UI** | Login, sessions, commands, SignalR, **session token mint** |
| **ESP32** | LAN → **cloud API URL** — never talks to Pi for app logic |
| **Pi** | V4L2 → go2rtc; edge agent session hooks; **outbound tunnel** for live video |
| **Cloudflare** | Pi initiates tunnel; browser hits public hostname → Pi go2rtc (or JWT proxy) |

**Video does not transit the API body.** Operators use **two HTTPS paths**:

| Path | Example | Purpose |
|------|---------|---------|
| **App** | `https://somnet.example.com` | Dashboard, controls, token mint |
| **Video** | `https://<pi-tunnel-host>/go2rtc/stream.html?src=front&token=…` | MSE/WebSocket **directly from Pi** via tunnel |

Pairing field **`video.tunnelBaseUrl`** (per dom/sub) holds the Pi’s public video base (e.g. `https://site-abc.trycloudflare.com` or a named hostname). Phase 6 left it **empty** (same-origin through tunneled PC API); **Phase 7+ uses split-origin** (API host ≠ video host).

---

## Phase 7 bench (dev split)

While API remains on the **dev PC**, the Pi runs **video edge only** — not the full SomNet stack.

| Component | Phase 7 bench | Production (Phase 8) |
|-----------|---------------|----------------------|
| **API + UI** | Dev PC (`5031`) | **Azure App Service** |
| **go2rtc** | **Pi only** (`:1984`) | **Pi only** |
| **Edge agent** | **Pi** (`:5190`) | **Pi** |
| **cloudflared** | **Pi** — tunnel go2rtc (or JWT proxy), **not** PC `:5031` | **Pi** — named tunnel / site hostname |
| **ESP32 `server_url`** | LAN → **PC API** | **Azure production URL** |
| **`tunnelBaseUrl`** | Pi Quick Tunnel URL (no trailing slash) | Pi production tunnel hostname |
| **Viewer mode** | **`mse`** (`VITE_VIDEO_VIEWER_MODE=mse`) | Same |

**Contrast with Phase 6:** Phase 6 tunneled the **whole PC API** (`5031`); go2rtc was reached same-origin via API `/go2rtc` proxy. Phase 7 tunneled **Pi video origin**; iframe `src` uses **`tunnelBaseUrl` + token**, not relative `/go2rtc` on the API host.

---

## Locked decisions

| ID | Decision | Choice | Date |
|----|----------|--------|------|
| **V7-D1** | Camera layout | **A-dev** — 2× USB webcam on Pi | 2026-09-11 |
| **V7-D2** | Why A-dev over IP | No vendor cloud tunnel; security = SomNet session tokens + tunnel only | 2026-09-11 |
| **V7-D3** | Pi model | Pi 4 or 5, 8 GB — validate dual-stream CPU/thermal soak | 2026-09-11 |
| **V7-D4** | Pi OS | **Raspberry Pi OS Lite (64-bit)** — Bookworm; headless, SSH only | 2026-09-13 |
| **V7-D5** | Boot media | **USB SSD** preferred over SD-only for 24/7 soak (V7-T2) | 2026-09-13 |
| **V7-D6** | Bench topology | **Split-origin** — go2rtc + tunnel on Pi; API on dev PC | 2026-09-13 |
| **V7-D7** | Production API | **Cloud (Azure)** — Pi does **not** host SomNet API in production | 2026-09-13 |
| **V7-D8** | ESP32 target | **Cloud API URL** in production; Phase 7 bench uses **LAN PC API** | 2026-09-13 |
| **V7-D9** | Live viewer | **MSE** (`mode=mse`) — not HLS for dashboard embed | 2026-09-13 |
| **V7-D10** | Token gateway (split) | JWT validation must run on **Pi video path** — shared signing key with API ([§ Token gateway](#token-gateway-split-origin-gap)) | 2026-09-13 |
| **V7-D11** | Snapshots (bench) | API `Go2RtcBaseUrl` → **Pi LAN IP `:1984`** while API on PC ([§ Snapshots](#snapshots-split-origin)) | 2026-09-13 |

---

## Pi OS setup (headless)

Use **[Raspberry Pi Imager](https://www.raspberrypi.com/software/)** → **Raspberry Pi OS Lite (64-bit)**.

| Step | Setting |
|------|---------|
| Hostname | e.g. `somnet-edge` |
| User / password | Service account (document locally; not in repo) |
| **SSH** | **Enable** — primary admin path; no monitor required |
| Wi‑Fi | Optional for bench; **Ethernet preferred** for production box |
| Storage | Flash to **USB SSD** if hardware supports USB boot |

**Post-imaging (SSH):**

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y v4l-utils ffmpeg
# go2rtc arm64 binary — see repo scripts (TBD Phase 7 implementation)
v4l2-ctl --list-devices   # confirm front + rear USB paths
```

**Alternatives:** Ubuntu Server 24.04 LTS arm64 works but Pi OS Lite is the default for V4L2/USB support and community go2rtc examples.

---

## Prerequisites

- [Phase 6](./19-Video-Phase-6-Tunnel-Checklist.md) signed off on dev PC (token gateway, MSE, bandwidth tiers)
- Pi 4/5 (8 GB), adequate PSU, **Ethernet** to same LAN as dev PC + ESP32
- Two USB webcams with adequate cable reach (or powered hub within ~3 m of Pi)
- **Raspberry Pi OS Lite 64-bit** imaged; SSH working
- Dev PC running SomNet API + UI (`5031`); ESP32 paired with **LAN PC URL**
- Shared **`Video:StreamTokenSigningKey`** (or equivalent) available to **both** API and Pi edge agent for JWT validation

---

## Repo gaps (implement during Phase 7)

Today `SomNet.Edge/scripts/` is **Windows-only**. Phase 7 should add:

| Artifact | Purpose |
|----------|---------|
| `config/go2rtc.yaml.pi.example` | V4L2 `front` / `rear` + bandwidth tiers (`front_medium`, etc.) |
| `scripts/install-go2rtc-linux.sh` | arm64 binary to `/opt/somnet-edge/` or `SOMNET_EDGE_HOME` |
| `scripts/start-go2rtc-linux.sh` | Foreground / systemd helper |
| `systemd/go2rtc.service` | Restart on failure |
| `systemd/somnet-edge-agent.service` | Edge agent on `:5190` |
| `scripts/install-cloudflared-linux.sh` | Pi tunnel client |
| `scripts/start-cloudflare-tunnel-pi.sh` | Quick Tunnel → **`:1984`** (or proxy port) |
| `config/cloudflared-pi.example.yml` | Named tunnel template (production) |

---

## Token gateway (split-origin gap)

Phase 5 **`VideoStreamGatewayMiddleware`** runs on the **API** and gates `/go2rtc/*` when same-origin (Phase 6).

When iframe URLs point at the **Pi tunnel hostname**, that middleware is **not in the request path**. Without a Pi-side gate, tunneled go2rtc is **public**.

**Required for V7-T3 sign-off:**

- [ ] **Pi-side JWT validation** — one of:
  - Extend **edge agent** (or small reverse proxy on Pi) to validate `token` query + session cookie on `/go2rtc/*` before forwarding to go2rtc `:1984`, **or**
  - Port shared validation logic from `VideoStreamGatewayMiddleware` to a minimal Kestrel listener on Pi
- [ ] **Shared signing key** — same secret as API `Video:StreamToken` config; deploy via secure local file on Pi (not committed)
- [ ] **403 without token** — `/go2rtc/stream.html?src=front` on **Pi tunnel URL** returns **403** (mirror V5-T3 / V6-T3)
- [ ] **Revoke on session end** — ended session token → **403** on Pi tunnel URL

**Phase 7 bench tunnel target:** expose the **JWT proxy** (recommended) or go2rtc through `cloudflared` — document chosen port in Pi runbook.

---

## Snapshots (split-origin)

Phase 4/5: **`VideoSnapshotService`** on API pulls JPEG frames from **`Go2RtcBaseUrl`** (localhost `:1984` on PC bench).

| Mode | `Go2RtcBaseUrl` / capture path |
|------|--------------------------------|
| **Phase 7 bench** (API on PC, go2rtc on Pi) | API `appsettings`: `http://<pi-lan-ip>:1984` — PC must reach Pi on LAN |
| **Phase 8 production** (API on Azure) | Azure **cannot** reach Pi LAN — implement **edge capture upload** (edge agent POSTs bytes to API) or tunnel-only fetch (discouraged); track in [Phase 8](./21-Video-Phase-8-Azure-Cutover-Checklist.md) |

**Phase 7 checklist:**

- [ ] Set API **`Video:Snapshot:Go2RtcBaseUrl`** (or `VideoSnapshotSettings`) to Pi LAN URL for bench E2E
- [ ] V7-T4: stroke → ack → JPEG on disk + history gallery (same as V6-T4)
- [ ] Document production gap → Phase 8 exit criteria

---

## Implementation checklist

### Hardware

- [ ] Pi 4/5 with adequate PSU; **Ethernet** to LAN
- [ ] **USB SSD** boot (or high-endurance SD for bench only)
- [ ] Front webcam (expression) + rear webcam (tool view) on USB ports or hub
- [ ] Confirm both devices in `v4l2-ctl --list-devices`

### Pi OS + base packages

- [ ] Flash **Pi OS Lite 64-bit**; SSH enabled; hostname set
- [ ] `v4l-utils`, `ffmpeg` installed
- [ ] Optional: disable unused services; confirm stable LAN IP (DHCP reservation recommended)

### go2rtc (Pi)

- [ ] Copy/adapt `go2rtc.yaml.pi.example` — V4L2 sources (not DirectShow `exec`)
- [ ] Streams: `front`, `rear` — H.264; 720p live acceptable for soak
- [ ] Bandwidth tiers: `front_medium`, `rear_medium`, `front_low`, `rear_low` (match [Phase 6 V6-D18](./19-Video-Phase-6-Tunnel-Checklist.md))
- [ ] Local smoke: `http://<pi-ip>:1984/stream.html?src=front` and `src=rear` — **distinct** feeds
- [ ] **systemd** unit for go2rtc; restart on failure

### Edge agent (Pi)

- [ ] Build/deploy **`SomNet.Edge.Agent`** for **linux-arm64**
- [ ] `appsettings`: `Go2RtcBaseUrl` = `http://localhost:1984`; API notify URL = **dev PC LAN** `:5031`
- [ ] `X-SomNet-Edge-Key` matches API `Video:Edge` config
- [ ] **systemd** unit; `GET /health` OK
- [ ] Token gateway on Pi video path ([§ Token gateway](#token-gateway-split-origin-gap))

### Cloudflare tunnel (Pi)

- [ ] Install `cloudflared` on Pi
- [ ] Quick Tunnel (bench) → Pi **video/proxy port** (not dev PC `5031`)
- [ ] Copy **`https://….trycloudflare.com`** → pairing **`video.tunnelBaseUrl`** for test dom/sub (**no trailing slash**)
- [ ] Named tunnel template deferred to Phase 8 production hostname

### API + pairing (dev PC)

- [ ] API running on PC; ESP32 `server_url` = **PC LAN** (unchanged from Phase 6)
- [ ] Pairing JSON: set **`tunnelBaseUrl`** to Pi tunnel base for test sub
- [ ] API **`Go2RtcBaseUrl`** → Pi LAN for snapshots ([§ Snapshots](#snapshots-split-origin))
- [ ] UI built with `VITE_VIDEO_VIEWER_MODE=mse`; operator opens **PC URL** (or PC tunnel if used) — video iframes load from **`tunnelBaseUrl`**

### E2E

- [ ] ESP32 paired; manual/automatic session via **LAN API**
- [ ] Remote operator (off LAN): login on app URL → Start feed → front + rear via **Pi tunnel** + tokens
- [ ] Command → ack → snapshot from Pi-fed go2rtc
- [ ] Session end → tokens revoked on **Pi tunnel** URLs

---

## Dev startup (Phase 7 bench)

**Dev PC (unchanged core):**

```powershell
dotnet run --project SomNet.API
# ESP32 → http://<pc-lan-ip>:5031
```

**Pi (SSH — after systemd install, use `systemctl start` instead):**

```bash
# Terminal equivalents — see SomNet.Edge/scripts/*.sh when added
./start-go2rtc-linux.sh
./start-edge-agent-linux.sh      # includes or fronts JWT proxy
./start-cloudflare-tunnel-pi.sh  # prints tunnelBaseUrl for pairing
```

Set pairing **`tunnelBaseUrl`** to the printed `https://….trycloudflare.com` before remote smoke tests.

---

## Smoke tests

Run **V7-T3** from a device **off LAN** (e.g. phone on cellular). Pi services + `cloudflared` must be running; API on dev PC reachable for app login (PC LAN, or separate PC tunnel if needed for remote app access).

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **V7-T1** | Both V4L2 devices in go2rtc on Pi | `src=front` and `src=rear` play locally on Pi (`:1984`) | ☐ |
| **V7-T2** | 24 h dual-stream soak on Pi | No go2rtc crash; CPU/temp acceptable; no thermal throttle | ☐ |
| **V7-T3** | Remote operator — **split-origin** | Login on **API origin**; feeds load from **`tunnelBaseUrl`**; front + rear distinct; **token required** (403 without); revoked after session end | ☐ |
| **V7-T4** | Full session with ESP32 | Command, ack, snapshot, history complete (`Go2RtcBaseUrl` = Pi LAN from PC API) | ☐ |
| **V7-T5** | Pi tunnel `/go2rtc/…` without token | **403** on **Pi hostname** (not only API hostname) | ☐ |
| **V7-T6** | Options bandwidth tier | Medium/Low `src=` tiers play through Pi tunnel (yaml tiers present) | ☐ |

---

## Exit criteria

- **V7-T1–T6** pass
- **V7-D4–D11** validated in bench docs / runbook
- **V1-D11 validated** — Pi 4/5 + 2× USB webcam accepted as production edge while IP on hold
- Pi-side **token gateway** implemented and tested (not deferred to Phase 8)
- Production snapshot path for Azure documented → [Phase 8](./21-Video-Phase-8-Azure-Cutover-Checklist.md)
- → [Phase 8 — Azure cutover](./21-Video-Phase-8-Azure-Cutover-Checklist.md)

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial stub |
| 2026-09-11 | **V1-D11** — A-dev 2× USB on Pi as production target while IP on hold |
| 2026-09-13 | Production + bench **split-origin** architecture; Pi OS Lite; `tunnelBaseUrl`; token gateway + snapshot paths; MSE (not HLS); repo gap list; V7-T5–T6 |
