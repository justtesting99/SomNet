# Video — Phase 6 Tunnel (remote operator, no Azure)

**Status:** **Ready** — [Phase 5](./18-Video-Phase-5-Edge-Agent-Checklist.md) signed off (2026-09-12)

> **Phase 5:** Signed off (Layout A-dev manual v1).

| Related | Link |
|---------|------|
| Architecture §5, §10 | [13 — Operator experience & session-scoped streaming](./13-Video-And-Camera-Architecture.md#5-operator-experience--security) |
| Plan | [14-Video-Implementation-Plan.md](./14-Video-Implementation-Plan.md) |
| Token + `tunnelBaseUrl` | [16 — Phase 3 Session tokens](./16-Video-Phase-3-Session-Tokens-Checklist.md) |
| Token gateway | [18 — Phase 5 Edge agent](./18-Video-Phase-5-Edge-Agent-Checklist.md) |
| Edge README | [`SomNet.Edge/README.md`](../SomNet.Edge/README.md) |

**Goal:** Expose the **dev PC SomNet stack** to a **remote operator** over HTTPS using **Cloudflare Tunnel** (`cloudflared`). No Azure App Service. Live feeds still require **session tokens** (Phase 5 gateway).

**Out of scope (Phase 6):** Azure cutover ([Phase 8](./21-Video-Phase-8-Azure-Cutover-Checklist.md)); Pi deploy ([Phase 7](./20-Video-Phase-7-Pi-Production-Checklist.md)); split-origin video subdomain; Tailscale Funnel implementation (documented as alternate only); Cloudflare Access hardening (optional later).

---

## Operator experience (what the domain is for)

The remote operator uses **one URL** — the tunneled SomNet app (e.g. `https://somnet-dev.example.com`). That page is the full dashboard: login, controls, history, and embedded video monitors.

| What | Who configures it | Operator sees |
|------|-------------------|-----------------|
| **Tunnel hostname** | Installer / infra (Cloudflare DNS + `cloudflared`) | Normal SomNet bookmark — not a separate “video app” |
| **Live video iframes** | API mints token URLs on **same hostname** (`/go2rtc/…`) | “The app’s cameras” inside the dashboard |
| **`tunnelBaseUrl` pairing field** | Leave **empty** for v1 (same-origin) | N/A — relative `/go2rtc` paths work through the tunnel |

The domain is **infrastructure**, like pointing DNS at a server. Operators do not configure RTSP, go2rtc, or a second video URL. Phase 8 may use a production hostname on Azure for the shell and a site hostname on the Pi for video; Phase 6 proves the tunnel model on the dev PC with a single tunneled API origin.

---

## Cost & licensing

### Cloudflare Tunnel (v1 — develop for this)

| Item | Cost | Notes |
|------|------|--------|
| **`cloudflared` tunnel** | **$0** | Included on all Cloudflare plans; no per-GB egress fee for tunnel traffic |
| **Cloudflare DNS hosting** | **$0** | Free plan is sufficient |
| **Domain name** | **~$10–15/year** | One-time annual registrar cost; not a monthly SaaS fee |
| **SomNet login** | **$0** | App JWT — primary auth for Phase 6 |
| **Cloudflare Access** (optional) | **$0** up to 50 users; then ~**$7/user/month** | Extra identity gate in front of SomNet — **not required** for dev bench |

**Typical Phase 6 cost:** **domain registration only** (~$10–15/year). Tunnel bandwidth for one operator + two webcam streams is not metered by Cloudflare.

**Long-term fit:** Custom hostname, DDoS at edge, same model for Pi production ([Phase 7](./20-Video-Phase-7-Pi-Production-Checklist.md)) and Azure + tunnel split ([Phase 8](./21-Video-Phase-8-Azure-Cutover-Checklist.md)).

### Tailscale Funnel (alternate — not implementing in Phase 6)

| Item | Cost | Notes |
|------|------|--------|
| **Funnel feature** | **$0** on Personal plan | [Tailscale docs](https://tailscale.com/docs/features/tailscale-funnel) — all plans |
| **Personal plan** | **$0** (≤6 users) | **Non-commercial use only** — poor fit for production SomNet |
| **Business plans** | **$8–18/user/month** | If commercial tailnet required |

**Why not v1:** `*.ts.net` hostname only (no custom domain on Funnel), HTTPS-only fixed ports, beta, non-commercial Personal ToS. Useful for a quick personal experiment; **Cloudflare is the production-aligned path**.

### Production scale & client advisory

**Expected production operator base:** ~**10 users** (initial deployment). Cloudflare scales beyond this without changing the SomNet tunnel architecture.

| Layer | ~10 operators | Growth path | Client talking point |
|-------|---------------|-------------|----------------------|
| **Cloudflare Tunnel** (`cloudflared`) | **$0** | Same at higher headcount — no per-user tunnel fee, no video egress meter | “Site connectivity is not priced per operator.” |
| **Domain** | **~$10–15/year** | One domain per deployment (or per brand); not per user | “Fixed annual DNS cost.” |
| **SomNet login** | App-managed users | Scales with Azure/SQL in [Phase 8](./21-Video-Phase-8-Azure-Cutover-Checklist.md) — separate from Cloudflare | “User accounts are in SomNet, not Cloudflare.” |
| **Cloudflare Access** (optional extra gate) | **$0** — within **50-user free tier** | Beyond 50 authenticated Access users: ~**$7/user/month** (pay-as-you-go Zero Trust) | “Optional; only if you want Cloudflare to authenticate before SomNet. Not required for v1.” |
| **Session stream tokens** | **$0** at Cloudflare | Issued by SomNet API; no Cloudflare seat | “Live video access is session-scoped in the app.” |

**For a ~10-user production site today:**

- Tunnel + DNS stay on **Cloudflare Free** — no monthly Cloudflare bill for connectivity.
- **SomNet JWT** remains the primary operator auth (same as dev); Cloudflare Access is optional hardening, not a Phase 6 requirement.
- Headroom to **~50 operators** before any Cloudflare Access licensing applies — well above the initial ~10-user target.

**If the product expands (client advisory):**

1. **10 → 50 operators** — tunnel model unchanged; still **$0** Cloudflare tunnel fees; budget Azure/app hosting separately ([Phase 8](./21-Video-Phase-8-Azure-Cutover-Checklist.md)).
2. **Optional Cloudflare Access** — add only if the client wants an identity provider gate in front of the tunnel URL; free tier covers up to 50 users.
3. **Beyond 50 Access users** — plan ~**$7/user/month** for Zero Trust seats (Access logins only; does not affect tunnel bandwidth pricing).
4. **More sites / doms** — each tool site may run its own `cloudflared` + Pi edge; cost is **per site** (domain + hardware), not multiplied by operator count at a given site.

Document Cloudflare pricing in client proposals as **variable only if Access is adopted and headcount exceeds 50**, or if paid Zero Trust features (extended log retention, SLA) are requested. Otherwise quote **domain + Azure + edge hardware** — not per-operator tunnel fees.

---

## Architecture (Phase 6 v1)

Tunnel **SomNet API only** (port **5031**). Token gateway (Phase 5) stays on the API `/go2rtc` YARP proxy — **do not** expose raw go2rtc **:1984** to the internet.

```
Remote operator (cellular / other network)
        │
        ▼  HTTPS
Cloudflare edge ── cloudflared ──► localhost:5031  SomNet API + UI + /go2rtc proxy
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
              localhost:1984    localhost:5190         ESP32 (LAN)
                 go2rtc          edge agent          SignalR → API
```

| Service | Reachable from internet? | Notes |
|---------|--------------------------|--------|
| SomNet API **5031** | **Yes** (via tunnel) | UI, REST, SignalR, `/go2rtc` proxy |
| go2rtc **1984** | **No** | Localhost only; YARP + token middleware |
| Edge agent **5190** | **No** | API webhooks on localhost |
| ESP32 | **LAN only** | Connects to LAN API URL; remote operator commands flow **remote → tunnel → API → hub → device** |

**`tunnelBaseUrl`:** leave empty in pairing settings — iframe URLs stay same-origin (`/go2rtc/stream.html?src=front&token=…`) through the public hostname.

---

## Locked decisions (v1)

| ID | Decision | Choice |
|----|----------|--------|
| **V6-D1** | Tunnel provider | **Cloudflare Tunnel** (`cloudflared`) |
| **V6-D2** | Tunneled service | **SomNet API only** (5031) — includes UI dist + `/go2rtc` YARP |
| **V6-D3** | `tunnelBaseUrl` | **Empty** — same-origin video through tunneled API |
| **V6-D4** | Auth layers | **SomNet login JWT** required; session **stream tokens** required for video; Cloudflare Access **optional** (defer) |
| **V6-D5** | Domain (Phase 6) | **Quick Tunnel** only — custom hostname deferred to Phase 7/8 (~$10–15/year when adopted) |
| **V6-D6** | WebSockets | Tunnel route must allow **SignalR** and go2rtc **WebSocket/MSE** (long-lived connections) |
| **V6-D7** | Tunnel setup | **Dashboard-managed** named tunnel + local `cloudflared` credentials (gitignored) |
| **V6-D8** | Phase 6 hostname | **Quick Tunnel** (`*.trycloudflare.com`) — custom domain deferred to Phase 7/8 |
| **V6-D9** | Code scope | **Scripts + docs only** — verify existing same-origin app; no proactive API changes |
| **V6-D10** | Local config path | **`D:\SomNet.Edge\`** (alongside `go2rtc.yaml`; `SOMNET_EDGE_HOME` pattern) |
| **V6-D11** | Extra auth | **SomNet login only** — Cloudflare Access deferred |
| **V6-D12** | Quick Tunnel command | **`cloudflared tunnel --url http://localhost:5031`** — new `*.trycloudflare.com` URL each run |
| **V6-D13** | Viewer mode | **`mode=mse`** (existing bench default) — WebSocket/MSE through Cloudflare |
| **V6-D14** | ESP32 API URL | **Unchanged LAN URL** — remote operator uses tunnel; device stays on local API |
| **V6-D15** | Proxy/cookie fixes | **Only if V6-T2/T5 fail** — e.g. `Secure` cookie, forwarded headers (no proactive API change) |
| **V6-D16** | Sign-off scope | **Dev PC only** (Layout A-dev) — Pi tunnel repeated in [Phase 7](./20-Video-Phase-7-Pi-Production-Checklist.md) |

---

## Prerequisites

- [Phases 1–5](./14-Video-Implementation-Plan.md) signed off on dev PC (go2rtc, edge agent, API token gateway)
- Cloudflare account (free tier)
- `cloudflared` installed on dev PC
- **Phase 6:** Quick Tunnel — **no custom domain required** (domain ~$10–15/year deferred to Phase 7/8)
- ESP32 paired on **same LAN** as API (for command E2E smoke test)
- Remote test device on **different network** (phone hotspot) for V6-T1+

---

## Implementation checklist

### Cloudflare Quick Tunnel (V6-D12)

- [ ] `cloudflared` on PATH (or `D:\SomNet.Edge\bin\`)
- [ ] Run **`cloudflared tunnel --url http://localhost:5031`** — copy printed `*.trycloudflare.com` URL for smoke tests
- [ ] Note: URL **changes each run** — acceptable for Phase 6 dev; named tunnel + custom DNS → Phase 7/8
- [ ] (Optional later) Dashboard named tunnel + credentials in `D:\SomNet.Edge\` per V6-D7 — not required for first smoke

### Scripts & config (repo)

- [x] `SomNet.Edge/scripts/start-cloudflare-tunnel.ps1` — wraps `cloudflared tunnel --url http://localhost:5031`
- [x] `SomNet.Edge/scripts/install-cloudflared-windows.ps1` — download to `D:\SomNet.Edge\bin\`
- [x] `SomNet.Edge/config/cloudflared.example.yml` — template for **future** named tunnel (Phase 7/8); gitignored live creds in `D:\SomNet.Edge\`
- [x] Update [`SomNet.Edge/README.md`](../SomNet.Edge/README.md) — Phase 6 quick start

### Firewall / exposure

- [ ] **No** inbound port-forward for 5031, 1984, or 5190 on router
- [ ] Windows Firewall: allow **outbound** `cloudflared`; API still bound localhost/LAN as today
- [ ] Verify go2rtc **not** reachable at `public-ip:1984`

### SomNet config (minimal code expected — V6-D9)

- [ ] Pairing `video.tunnelBaseUrl` remains **empty** for same-origin v1
- [ ] Confirm token mint produces `/go2rtc/…` URLs (works relative to tunneled origin)
- [ ] SignalR hub connects over `wss://` through tunnel (no hardcoded `localhost` in UI)
- [ ] **`VITE_VIDEO_VIEWER_MODE=mse`** unchanged (V6-D13) — retest with `webrtc` only if feeds fail

### ESP32 (V6-D14)

- [ ] Device **`server_url`** stays **LAN API** (e.g. `http://192.168.x.x:5031`) — do **not** point ESP32 at Quick Tunnel URL
- [ ] V6-T4: remote operator → tunnel → API → SignalR → ESP32 on LAN

### Fix only if smoke fails (V6-D15)

- [ ] `Secure` cookie / forwarded headers on API — **only** if V6-T2 or V6-T5 fail through tunnel

### Optional (defer)

- [ ] Cloudflare Access policy in front of SomNet
- [ ] Split-origin `tunnelBaseUrl` (separate video hostname)
- [ ] Options UI editor for `tunnelBaseUrl`
- [ ] Custom domain + named tunnel route (Phase 7/8)

---

## Smoke tests

Run from a device **off LAN** (e.g. phone on cellular). All three local services must be running (go2rtc, edge agent, API) plus `cloudflared`.

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **V6-T1** | Open `https://<tunnel-host>/` | SomNet login page loads over HTTPS | ☐ |
| **V6-T2** | Login → Manual → first stroke → feeds | Front + rear play in dashboard | ☐ |
| **V6-T3** | Open `/go2rtc/stream.html?src=front` without token | **403** (Phase 5 gateway still enforced) | ☐ |
| **V6-T4** | Remote stroke (ESP32 on LAN) | Ack; snapshot on disk + history gallery | ☐ |
| **V6-T5** | Switch mode or Sub change | Feeds clear; old token URL → **403** | ☐ |

**Exit:** V6-T1–T5 on **dev PC** (V6-D16) → [Phase 7 — Pi production](./20-Video-Phase-7-Pi-Production-Checklist.md).

---

## Dev startup (Layout A-dev + tunnel)

```powershell
# Terminal 1 — go2rtc
.\SomNet.Edge\scripts\start-go2rtc-windows.ps1

# Terminal 2 — edge agent
.\SomNet.Edge\scripts\start-edge-agent.ps1

# Terminal 3 — API (serves UI dist)
dotnet run --project SomNet.API

# Terminal 4 — Cloudflare Tunnel (after scripts land)
.\SomNet.Edge\scripts\start-cloudflare-tunnel.ps1
```

Remote operator opens the **`https://….trycloudflare.com`** URL printed by `start-cloudflare-tunnel.ps1` — not `localhost`.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Login works; feeds black | WebSocket blocked — check Cloudflare route / `cloudflared` logs |
| SignalR disconnected | Tunnel WebSocket support; mixed content if URL not HTTPS |
| Video 403 with token | Token gateway OK on LAN? Retest locally before blaming tunnel |
| Commands fail remotely | ESP32 must reach **LAN** API; tunnel only carries operator browser traffic |
| `*.ts.net` / custom video URL | Wrong path — Phase 6 uses **one** Cloudflare hostname for the whole app |

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial stub |
| 2026-09-12 | Expanded checklist — Cloudflare v1, cost/licensing, architecture, smoke tests; Tailscale alternate documented |
| 2026-09-12 | Production scale (~10 users) and client advisory — Cloudflare growth path to 50+ operators |
| 2026-09-12 | Locked V6-D7–D11 — Quick Tunnel for Phase 6; scripts-only; D:\\SomNet.Edge config; SomNet auth only |
| 2026-09-12 | Locked V6-D12–D16 — Q6a quick tunnel cmd; Q7a mse; Q8a ESP32 LAN; Q9a fix-if-fail; Q10a dev PC sign-off |
