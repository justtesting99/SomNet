# Site operating profiles — cloud, Pi-hosted API, and ESP32 fallback (draft)

**Status:** **Design only** — not implemented. Captures feasibility, architecture, and **three deployment tiers** from discussion through 2026-09-24.

**Former title:** *ESP32 local / offline operate mode* — this doc now covers **online (tier 1)**, **site-local API on Pi (tier 2 / Mode B)**, and **ESP32-only fallback (tier 3 / Mode A)**.

**Intent:** When SomNet **cloud UI/API is unavailable**, site operation continues on the **LAN**. **Preferred route:** run a **cloud-equivalent SomNet.API (+ UI) on the site Pi**; **ESP32 firmware stays as shipped today** — only **`server_url`** (and pairing target) points at the Pi instead of Azure. **Optional fallback:** Mode A adds ESP32-hosted `/operate` when **both** cloud and Pi API are down.

| Mode | Name | ESP32 firmware | Operator + API | Video / stills |
|------|------|----------------|----------------|----------------|
| **B** ★ | **Pi-hosted API** (preferred) | **Unchanged** — SignalR to Pi LAN URL | **SomNet.UI + SomNet.API** on Pi | **Yes** — go2rtc on Pi |
| **A** | **ESP32-only fallback** | **New** — `/operate`, `/api/local/*` | Browser → ESP32 HTTP | **No** — optional JSON history on flash |

★ **Mode B** is the same pattern as **dev bench** (ESP32 → LAN API on PC); production offline colocates that API on the **Pi** with go2rtc. **No multi-Dom.** Cameras stay on Pi — [13 — Video & Camera Architecture](./13-Video-And-Camera-Architecture.md).

| Related | Link |
|---------|------|
| Device plan | [09 — ESP32 Device Plan](./09-ESP32-Device-Plan.md) |
| Wire payloads | [SomNet.Device/docs/PROTOCOL.md](../SomNet.Device/docs/PROTOCOL.md) |
| Network / HTTP coexistence | [09 — ESP32 Network Spec](./09-ESP32-Network-Spec.md) |
| Video / Pi edge (Mode B) | [13 — Video & Camera Architecture](./13-Video-And-Camera-Architecture.md) · [14 — Video plan](./14-Video-Implementation-Plan.md) · [Phase 5 edge agent](./18-Video-Phase-5-Edge-Agent-Checklist.md) · [Phase 7 Pi](./20-Video-Phase-7-Pi-Production-Checklist.md) |
| Edge agent code | [SomNet.Edge.Agent](../SomNet.Edge.Agent/) · [SomNet.Edge](../SomNet.Edge/) |
| Cloud session history (reference) | [07 — Session & History](./07-Session-And-History.md) |
| P16 cloud gating (contrast) | [25 — Session accessory](./25-Session-Accessory-In-Progress-Checklist.md) |
| Flash partitions (Mode A) | [SomNet.Device/docs/PARTITIONS.md](../SomNet.Device/docs/PARTITIONS.md) |

---

## 0. Three operating profiles (consolidated summary)

This is the **agreed mental model** for how a tool site can run. All tiers use the **same ESP32 relay firmware** for timing; tiers differ by **where the API/UI live** and **whether the Pi is in the loop**.

| Tier | Stack | Name in this doc | Status |
|------|--------|------------------|--------|
| **1** | **ESP32 + Pi + cloud API/UI** | **Online (production-normal)** | **Implemented** (video/phases ongoing on Pi) |
| **2** | **ESP32 + Pi** (API/UI on Pi, cloud unreachable) | **Mode B** — Pi-hosted API ★ | **Design** — preferred offline path |
| **3** | **ESP32 only** (no Pi API; optional no Pi at all for video) | **Mode A** — ESP32 `/operate` | **Design** — optional fallback |

### 0.1 Tier 1 — ESP32 + Pi + cloud (online)

| Aspect | Detail |
|--------|--------|
| **Operator** | **SomNet.UI** on **Azure** (or tunneled dev PC during development) |
| **ESP32** | `server_url` → **cloud** HTTPS/WSS; SignalR **`/hubs/hardware`** as today |
| **Pi** | **go2rtc** + USB webcams (+ edge agent); live video via **tunnel** to browser ([Phase 6–7](./20-Video-Phase-7-Pi-Production-Checklist.md)) |
| **Commands** | Cloud **SomNet.API** → hub → ESP32 |
| **Video / action stills** | **Yes** — API grabs frames from Pi go2rtc; storage cloud/local disk per phase |
| **Session history** | **Yes** — cloud DB + API ([07 — Session & History](./07-Session-And-History.md)) |
| **Remote operator** | **Yes** — cloud + video tunnel |

ESP32 does **not** handle video; Pi does **not** host the main API in **cloud-primary** production ([V7-D7](./20-Video-Phase-7-Pi-Production-Checklist.md)).

### 0.2 Tier 2 — ESP32 + Pi, Mode B (Pi-hosted API)

| Aspect | Detail |
|--------|--------|
| **Operator** | **SomNet.UI + SomNet.API** on **Pi LAN** (e.g. `http://<pi>:5031/`) |
| **ESP32** | **Firmware unchanged** — `server_url` → **Pi** base URL; same SignalR protocol |
| **Pi** | **API + UI + go2rtc** (+ edge agent) on one site box |
| **Commands** | Pi API → hub → ESP32 (identical to tier 1 flow, different host) |
| **Video / action stills** | **Yes** — same mechanisms as tier 1; `Go2RtcBaseUrl` → localhost on Pi |
| **Session history** | **Yes** — **same product behavior** (sessions, summaries, snapshot gallery); data on **Pi SQLite + SSD**, not Azure DB |
| **Remote operator** | **LAN-first** — on-site Wi‑Fi; off-site needs **tunnel to Pi** or return to tier 1 |

★ **Preferred offline / site-local route:** run a **cloud-equivalent** `SomNet.API` (+ UI) on the Pi — **not** a separate mini-protocol on ESP32. Work is **Pi hosting + site profile**, not `SomNet.Device` features.

### 0.3 Tier 3 — ESP32 only, Mode A (fallback)

| Aspect | Detail |
|--------|--------|
| **Operator** | Browser → **`http://<esp32-ip>/operate`** (embedded UI — **new firmware**) |
| **ESP32** | **Local HTTP** command ingress + optional JSON history on flash |
| **Pi** | **Absent or down** — no go2rtc, no LAN API |
| **Commands** | Local `/api/local/commands` → same execution FSMs (bypass SignalR) |
| **Video / action stills** | **No** — no cameras on ESP32; no edge gateway |
| **Session history** | **Optional** — text/JSON on device (**LittleFS/JSONL**); **not** image history |
| **Control parity** | **Similar** manual/automatic **payloads** (~85% functional vs SomNet.UI); not full React parity |

Use tier 3 only when **both** cloud **and** Pi API are unavailable and product requires continued strokes (**LO-D9**).

### 0.4 Side-by-side comparison

| | **Tier 1** Online | **Tier 2** Mode B | **Tier 3** Mode A |
|---|-------------------|-------------------|-------------------|
| **ESP32 firmware** | Shipped | **Same as tier 1** | **Extended** (`/operate`) |
| **Pi** | Video edge | Video + **API/UI** | Not required |
| **Cloud** | API/UI | Down / unreachable | Down |
| **Video** | Yes | Yes | No |
| **Images (action stills)** | Yes | Yes | No |
| **Session history** | Cloud DB | Pi DB + disk | Optional JSON on ESP32 |
| **Multi-Dom** | Product scope | **Out of scope** (single site) | **Out of scope** |

### 0.5 Nuances (discussion outcomes)

**Tier 1 vs tier 2 (on-site operator):** Can feel **very similar** — full SomNet UI, strokes, P16 session-accessory, video, history. Difference is **host** (Azure vs Pi) and **remote access** (tier 1 + tunnel to Pi for video; tier 2 is mainly **LAN** unless Pi is tunneled separately).

**Tier 2 “all / similar functionality”:** Target is the **same SomNet.API and SomNet.UI codebase** on Pi (SQLite site profile), **not** a one-off ESP32 UI. Requires **site deployment**, backups, and **release alignment** with cloud. Switching tier 1 ↔ tier 2 may require **`server_url`** change and **re-pair** if JWT signing keys differ.

**Tier 3 “similar functionality”:** **Control** (manual/automatic command shapes) — **not** full UI, video, or cloud-style history with snapshots. **No video on ESP32** — cameras remain on Pi in tiers 1–2 only ([13 — Video architecture](./13-Video-And-Camera-Architecture.md)).

**Video / images showstoppers on ESP32:** Not a product gap — **by design**. Stills are triggered by **API** from **go2rtc on Pi**; ESP32 only executes relay commands.

**Resources:** Tier 3 may use ESP32 **second core** / JSONL history optionally; **second ESP32** or **Pi mini-API only** were considered — **tier 2 full API on Pi** preferred over growing a minimal agent-only stack.

**Implementation priority (agreed):**

1. **Tier 1** — continue current roadmap (Azure + Pi video edge).
2. **Tier 2 (Mode B)** — **Phase E** in §13 — Pi-hosted API, ESP32 provisioning only.
3. **Tier 3 (Mode A)** — **Phases A–D** — only if tier-2-outage fallback is required.

---

## 1. Problem statement

Normal operation: operator uses **SomNet.UI** → **SomNet.API** → SignalR **`ExecuteCommand`** → ESP32 executes timing locally and **`AckCommand`** back.

**Gap:** If the configured server is unreachable (internet outage, cloud down), the ESP32 cannot receive commands when **`server_url`** only targets Azure.

**Goal (Mode B — preferred):** Host **SomNet.API + SomNet.UI** on the **site Pi** as an alternate to cloud — same REST, SignalR **`/hubs/hardware`**, sessions, video tokens, snapshot-on-ack. ESP32 **`server_url`** → `http://<pi>:5031` (or site hostname). **No ESP32 protocol or command-path changes.**

**Goal (Mode A — optional):** If the Pi is also down, add device **`/operate`** so strokes can still run from the ESP32 web server (requires firmware work — see §4–7).

---

## 2. Scope

### In scope — Mode A (ESP32-only)

| Area | Detail |
|------|--------|
| **Manual** | Stroke, burst, abort — same `payloadJson` as cloud ([PROTOCOL.md §6.3–6.4](../SomNet.Device/docs/PROTOCOL.md)) |
| **Automatic** | `automatic-start`, `automatic-stop`, `automatic-update`, abort — same snapshot shape as UI (`buildAutomaticStartPayload`; omit `running`) |
| **UI** | Embedded HTML/CSS/JS on ESP32 (PROGMEM or static assets), styled consistently with existing `/config` pages |
| **Auth** | PIN unlock → **browser session token** (Bearer header); not full LAN hardening |
| **Local “session”** | Arm/disarm local operate (replaces cloud **Session in Progress** + P16 for this mode) |
| **History (optional)** | Compact JSON / JSONL on **LittleFS or SPIFFS**; summaries + events; **no images** |
| **Single operator context** | One device, one local operator — **no multi-Dom**, no Sub switching |

### In scope — Mode B (Pi site stack) — see §8

| Area | Detail |
|------|--------|
| **Live video** | Pi **go2rtc** + USB webcams; browser MSE/embed (LAN URLs when cloud/tunnel down) |
| **Action stills** | Mini-API triggers frame grab from **local go2rtc** on hardware ack (same idea as `VideoActionSnapshotTrigger` on cloud API) |
| **Control path** | ESP32 → **SignalR to Pi** (`POST /api/devices/commands` equivalent); optional hosted **SomNet.UI** slice or full UI on Pi |
| **Sessions** | Local session rows (SQLite or in-memory + disk snapshots); session-scoped stream tokens |
| **Edge agent** | Extend [SomNet.Edge.Agent](../SomNet.Edge.Agent/) or run trimmed **SomNet.API** on Pi arm64 |

### Out of scope (both modes unless noted)

| Item | Reason |
|------|--------|
| Video on **ESP32** | Cameras and transcode stay on **Pi**; ESP32 is relay + optional Mode A UI only |
| Multi-Dom / multi-Sub UI | Single-site local operator |
| Identical **login DB** across cloud and Pi | Tier 2 uses **site-local users** unless sync is added later |
| Tier 1 cloud-primary on Pi | Normal production: Pi does **not** host main API ([Phase 7 V7-D7](./20-Video-Phase-7-Pi-Production-Checklist.md)); tier 2 is explicit **alternate profile** |
| Offline **command queue** when cloud returns | Still a device-plan non-goal unless approved separately |
| Pairing without ever reaching **some** API | Initial cloud pair may still be required; Mode B may allow **Pi-only** re-pair policy (TBD) |

### 2.1 Offline topologies (summary)

```
Mode B ★ — Pi-hosted API (cloud down, Pi up) — ESP32 UNCHANGED
  Browser → http://<pi-ip>:5031/     SomNet.UI (same as cloud UX)
  Pi      → SomNet.API :5031         same hubs/controllers as cloud
  ESP32   → server_url = Pi base URL
  ESP32   → outbound WSS/WS → Pi /hubs/hardware (same as today to Azure)
  Pi      → go2rtc :1984 ← USB webcams; snapshots via Go2RtcBaseUrl localhost

Mode A — ESP32 fallback (optional; Pi + cloud both unreachable)
  Browser → http://<esp32-ip>/operate
  ESP32   → local CommandHandler (NEW firmware — no SignalR required)

Policy: Prefer Mode B only unless Pi outage is a required scenario — see LO-D9, LO-D12.
```

**Note:** Mode B is **not a new ESP32 feature** — it reuses [Hardware User Guide](./Hardware-User-Guide.md) / `/config` **SomNet server URL** aimed at the Pi, identical in spirit to dev PC LAN IP ([08 — Development Guide](./08-Development-Guide.md)).

---

## 3. Feasibility summary

| Question | Conclusion |
|----------|------------|
| Can firmware execute the same strokes without cloud? | **Yes** — execution is already on-device (`ExecutionContext`, mode FSMs). |
| Can a browser UI replicate **functional** cloud controls? | **Yes (~85% confidence)** — manual ~92%; full automatic ~80% (field rules + live update). Not pixel-perfect React parity. |
| Enough flash/RAM on one ESP32-WROOM? | **Yes** for v1 — ~55% flash / ~18% RAM used today; local UI + history fits with partition tuning. |
| Second ESP32 required? | **No** for this scope — prefer larger filesystem partition + caps. Second chip only for physical HMI split or extreme isolation. |
| Second **core** required? | **Optional** — use a **history worker task** if flash writes stall `loop()`; not required for MVP. |
| Offline **video/images**? | **Mode B** — Pi-hosted API + go2rtc; **~85–90%** with **same** API/UI on Pi (SQLite). |
| ESP32 firmware for Mode B? | **None required** — `server_url` + pairing against Pi; optional `prod_cloud` vs `http://` on LAN. |
| ESP32 captures camera? | **No** — architectural constant ([13 §4](./13-Video-And-Camera-Architecture.md)). |

---

## 4. Architecture — Mode A (ESP32 local operate)

### 4.1 Dual ingress, shared execution

```
Phone/PC browser
  → HTTP (LAN) → ESP32 AsyncWebServer
       → Local auth (Bearer token)
       → LocalCommandService
       → CommandHandler / ExecutionContext  (same FSMs as SignalR)

Cloud (when up)
  → SignalR ExecuteCommand → CommandHandler (existing path)
```

**Principle:** Parse and validate payloads once per path where possible; **one** execution engine; **one** pending-command queue (cloud + local must not double-fire — policy TBD, see §12).

### 4.2 Routes (proposed)

| Route | Method | Purpose |
|-------|--------|---------|
| `/operate` | GET | Local control UI (manual + automatic tabs) |
| `/api/local/unlock` | POST | `{ "pin": "..." }` → session token + TTL |
| `/api/local/lock` | POST | Invalidate token; disarm local session |
| `/api/local/status` | GET | Armed, busy, automatic active, hub optional, last error |
| `/api/local/caps` | GET | e.g. `maxStrokeMs`, limits aligned with firmware |
| `/api/local/commands` | POST | `{ "commandKey", "payloadJson" }` |
| `/api/local/history` | GET | List recent local sessions (if history enabled) |
| `/api/local/history/{id}` | GET | Session detail / events |

Existing **`/`, `/config`, `/api/status`** unchanged.

### 4.3 Local auth model

1. **PIN** stored in NVS (set at provision or default once on serial).
2. **`POST /api/local/unlock`** validates PIN → generates random **32-byte token** in RAM, TTL (e.g. 8 h, refresh on use).
3. Browser stores token in **`sessionStorage`**; requests send `Authorization: Bearer <token>`.
4. Optional: **single active token** (new unlock invalidates previous).

**Threat model:** Trusted home/site LAN; goal is casual neighbor cannot POST strokes — not cryptographic zero-trust.

### 4.4 Local arm / disarm (replaces P16 for offline)

Cloud **Session in Progress** drives `session-accessory` GPIO and blocks strokes when OFF; accessory **fail-safe OFF** on hub/Wi‑Fi transport loss ([P16](./25-Session-Accessory-In-Progress-Checklist.md)).

For **local operate**, define explicit policy:

| Policy option | Behavior |
|---------------|----------|
| **A (recommended)** | **Unlock + arm** sets local session armed and may assert GPIO32 (or bypass accessory gate **only** for `CommandSource::Local`). Hub disconnect **does not** disarm local session. |
| **B (stricter)** | Local strokes only when hub offline (auto-detect). Cloud path takes precedence when hub up. |

**Disarm:** `POST /api/local/lock`, or after configurable idle timeout (optional).

### 4.5 Cloud path validation (unchanged)

SignalR commands still require: paired, hub connected, token/dom/sub match, session accessory ON for stroke/burst/automatic-start ([command_handler](../SomNet.Device/src/command_handler.cpp) today).

Local path **skips** hub/JWT/dom/sub checks; uses **local token + armed** instead.

### 4.6 HTTP completion semantics

Cloud UI waits on SignalR ack (bursts/automatic can run minutes). Local API should **not** hold one HTTP request open for entire burst.

| Pattern | Use |
|---------|-----|
| **Accept + poll** | `POST /api/local/commands` returns `{ "accepted": true, "correlationId" }`; client polls `/api/local/status` or `GET .../commands/{id}` for `resultJson` |
| **Immediate** | `automatic-start`, `automatic-stop`, `automatic-update`, `abort` accept/reject quickly |

Reuse firmware **`resultJson`** shapes from [PROTOCOL.md §8](../SomNet.Device/docs/PROTOCOL.md) in poll responses.

---

## 5. Payload parity (contract)

Local **`payloadJson`** must match cloud/API — firmware parsers stay authoritative.

**Manual stroke:**

```json
{ "powerPercent": 50, "strokeMs": 200 }
```

**Burst:**

```json
{
  "powerPercent": 50,
  "strokeMs": 200,
  "burstStrokes": 5,
  "burstDelayMs": 5000
}
```

(`burstDelayMs` = UI seconds × 1000.)

**Automatic start / update:** full automatic settings snapshot **without** `running` — same as `SomNet.UI` `buildAutomaticStartPayload()`. See PROTOCOL §6.5–6.7 (seven modes, `burstsOn`, burst sub-fields).

**Automatic stop:** `{}`

**Abort:** `{}`

**Command keys:** `stroke`, `burst`, `abort`, `automatic-start`, `automatic-stop`, `automatic-update`.

UI-side helpers to port or mirror in embedded JS: `computeStrokeMs`, `automaticFieldRules`, `burstFieldRules`, `applyAutomaticModeChange`, defaults from `defaultManualState` / `defaultAutomaticState`.

Firmware stroke cap: `kMaxStrokeMs` (**30000** ms in `config.h`); expose via `/api/local/caps`.

---

## 6. Local UI (ESP32-served pages)

### Approach

- Extend existing **PROGMEM / `config_pages` styling** (Phase 7 palette).
- **Vanilla JS** — no React/Vite on device.
- Settings: **`localStorage`** on browser (`somnet-local-manual`, `somnet-local-automatic`); optional later **`GET/PUT /api/local/settings`** → NVS for shared defaults.

### Functional parity vs SomNet.UI

| Feature | Local UI |
|---------|----------|
| Manual power, min/max ms, stroke/burst/abort | Yes |
| Automatic all modes + bursts-on fields | Yes (port field show/hide rules) |
| Live **automatic-update** while running | Yes — debounce ~400 ms like cloud |
| Session in Progress + ready double-click | No — replaced by unlock/arm |
| System status polling cloud API | Replace with `/api/local/status` |
| History dialog | Simplified list from `/api/local/history` |
| Video expand on stroke | No (use **Mode B** or cloud) |

### Confidence (functional, not visual)

| Slice | ~Confidence |
|-------|-------------|
| Manual stroke/burst/abort | 92% |
| Automatic start/stop | 88% |
| Automatic update while running | 78% |
| Overall narrowed scope | **85%** |

**Drift risk:** Field rules duplicated in TS vs device JS — mitigate with PROTOCOL + shared test vectors / checklist.

---

## 7. Local session history (optional)

### Purpose

Device-local audit for offline sessions — **not** cloud DB replacement. No photos; no Dom column.

### Storage

| Topic | Choice |
|-------|--------|
| Medium | **LittleFS** preferred over legacy SPIFFS; requires partition subtype / `board_build.filesystem` |
| Current table | `min_spiffs.csv` — **~192 KB** SPIFFS region, **unused** today ([PARTITIONS.md](../SomNet.Device/docs/PARTITIONS.md)) |
| Recommendation | **Custom partition** — keep dual OTA slots; allocate **256–512 KB** for filesystem if history is substantial |

SomNet does **not** use SPIFFS for HTML today (PROGMEM). Enlarging FS at expense of minimal SPIFFS sliver does **not** reduce OTA slot size.

### Schema (sketch)

**JSONL append** (`/history/events.jsonl`) — one JSON object per line:

- `sessionOpen` / `sessionClose`
- `strokeComplete`, `burstComplete`, `automaticComplete` — embed same inner objects as ack **`resultJson`**

**Index** (`/history/index.json`) — last **N** sessions with `id`, `startedAtUtc`, `endedAtUtc`, `mode`, `summary` string.

**Caps (example):** last **30 sessions** or **500 events**; rotate `events.jsonl` → `events.jsonl.1`.

**Timestamps:** ISO UTC when SNTP synced; else monotonic + `"timeSynced": false`.

**NVS:** counters only (`nextLocalSessionId`), not the log.

**Writes:** append-only preferred; full-file rewrite via **write temp + rename** for index updates.

### History API

- `GET /api/local/history` — list (Bearer token)
- `GET /api/local/history/{id}` — detail
- Optional: `GET /api/local/history/export.json` for backup
- Optional: `DELETE /api/local/history` (installer)

### Hook point

On command complete in **`CommandHandler`** (where `sendAck` builds `resultJson`), enqueue **`LocalHistoryEvent`** — do not block relay path on flash I/O.

---

## 8. Architecture — Mode B (Pi-hosted API — ESP32 unchanged)

When the **cloud** is unavailable but the **tool-site Pi** is on the same LAN as the ESP32, the Pi runs a **hosted SomNet stack** that **substitutes for Azure** for that site. The ESP32 **does not know** “offline mode” — it only connects to whatever **`server_url`** is in NVS (Pi hostname or IP), same as dev bench pointing at a PC.

### 8.0 Preferred shape: cloud-equivalent API on Pi

| Layer | Cloud (normal) | Pi site service (alternate) |
|-------|----------------|----------------------------|
| **SomNet.UI** | Azure App Service / CDN | **`dotnet` + Kestrel** serves `dist/` from Pi `:5031` |
| **SomNet.API** | Azure | **Same codebase**, `linux-arm64` publish, **SQLite** (or LocalDB-equivalent) instead of Azure SQL |
| **SignalR** | `/hubs/hardware` | **Identical** hub + `ExecuteCommand` / `PairDevice` / `AckCommand` |
| **ESP32** | `server_url` → cloud HTTPS | `server_url` → **`http://somnet-edge.local:5031`** (installer sets once or failover policy) |
| **go2rtc + agent** | Pi (Phase 7) | Same Pi — `Go2RtcBaseUrl=http://127.0.0.1:1984` in Pi `appsettings` |
| **Snapshots / sessions** | API + disk/Blob | API + **Pi SSD** paths |

**Why this route:** One implementation of commands, P16 session-accessory, history, and video — **no duplicate** embedded UI on ESP32, **no** `CommandHandler` local/cloud split in firmware. Maintenance tracks **one API** with a **site deployment profile**.

**ESP32 “as original” checklist:**

| Item | Change for Mode B? |
|------|-------------------|
| `ExecuteCommand` / ack protocol | **No** |
| Relay / automatic FSM | **No** |
| Config `/config` form | **No** — already has **SomNet server URL** field |
| Pairing (`PairDevice` JWT in NVS) | **No** — pair against **Pi** API when site is commissioned |
| TLS | Pi LAN often **`http://` + `ws://`** (dev profile); cloud uses **`prod_cloud` + wss** — installer picks build/URL per target ([README](../SomNet.Device/README.md)) |

When the **cloud** is unavailable but the **tool-site Pi** (go2rtc + webcams) is on the same LAN as the ESP32, **video and action stills stay on the Pi**; the API on Pi performs Azure’s role for commands and snapshots.

### 8.1 Production context (normal vs offline)

| Phase | Normal production ([Phase 7](./20-Video-Phase-7-Pi-Production-Checklist.md)) | Offline site mode (this doc) |
|-------|-----------------------------------------------------------------------------|------------------------------|
| **API + UI** | **Azure** | **Pi LAN** (mini-API ± static UI) |
| **ESP32 `server_url`** | Cloud HTTPS/WSS | **Pi LAN** base URL (installer/config or failover NVS) |
| **go2rtc + webcams** | Pi | Pi (unchanged) |
| **Edge agent** | Pi `:5190` | Pi — session hooks; may merge into mini-API |
| **Tunnel** | Cloudflare to Pi for **remote** operators | **Optional** — LAN operator uses Pi **private IP**; no tunnel required |

Decision **V7-D7** (*Pi does not host SomNet API in production*) applies to **cloud-primary** deployment. **Mode B** is an explicit **alternate site-local** profile for outage / air-gap LAN operation — document in installer guide, not a silent override of Phase 7.

### 8.2 Logical diagram

```
                    LAN (tool site)
  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │  Browser (operator phone/PC)                                │
  │       │ HTTPS/HTTP                                          │
  │       ▼                                                     │
  │  ┌──────────────────────── Pi (somnet-edge) ──────────────┐ │
  │  │ Mini-API :5031 (or full SomNet.API + SQLite)          │ │
  │  │  · sessions, tokens, /api/devices/commands            │ │
  │  │  · SignalR /hubs/hardware                             │ │
  │  │  · VideoActionSnapshotTrigger → localhost:1984        │ │
  │  │  · optional SomNet.UI dist/                           │ │
  │  │ Edge agent :5190 (existing or absorbed)               │ │
  │  │ go2rtc :1984 ← USB front/rear webcams                 │ │
  │  └───────────────▲────────────────────────────────────────┘ │
  │                  │ outbound WebSocket (SignalR)             │
  │            ┌─────┴─────┐                                    │
  │            │  ESP32    │  relay / automatic FSM             │
  │            └───────────┘                                    │
  └─────────────────────────────────────────────────────────────┘

  Cloud Azure: unreachable (offline scenario)
```

### 8.3 API on Pi: hosted service options

| Approach | ESP32 impact | Parity with cloud | Recommendation |
|----------|--------------|-------------------|----------------|
| **Full `SomNet.API` + UI on Pi (SQLite)** | **None** — same URLs/hubs | **Highest** | **★ Preferred** for “very similar API” |
| **Trimmed API** (devices + sessions + video only) | **None** if hub unchanged | Medium — drift risk | Only if full deploy too heavy |
| **Extend `SomNet.Edge.Agent` only** | **None** if hub added | Low — reimplements API pieces | Fallback / Phase 1 spike only |

**Recommended:** **`SomNet.Site` or `SomNet.API` with `Site` hosting profile** — single-tenant defaults, SQLite file on USB SSD, bundled go2rtc + agent systemd units ([Phase 7](./20-Video-Phase-7-Pi-Production-Checklist.md)). Same **JWT `Key`**, **HardwareHub**, and **Video:** config shape as cloud; drop Azure-specific bindings.

**Implementation work is on Pi/DevOps**, not `SomNet.Device`:

- ARM64 publish + systemd services (`somnet-api`, `go2rtc`, `edge-agent`)
- SQLite migrations / seed (one Dom, one Sub, installer user)
- `appsettings.Site.json`: local paths, `Go2RtcBaseUrl`, no Blob (disk snapshots)
- Optional: mDNS **`somnet-edge.local`** for stable ESP32 `server_url`

### 8.4 Mini-API capabilities (video + images)

Minimum set to match **scoped** cloud video behavior on LAN:

| Capability | Cloud today | Pi offline |
|------------|-------------|------------|
| Session start/end | `POST /api/sessions` | Local session store (SQLite or file) |
| Stream tokens | [Phase 3](./16-Video-Phase-3-Session-Tokens-Checklist.md) | Same JWT signing key as gateway ([V7-D10](./20-Video-Phase-7-Pi-Production-Checklist.md)) |
| Live feeds | iframe → go2rtc (tunnel or proxy) | iframe → **`http://<pi-lan>/go2rtc/...`** or API proxy on Pi |
| Snapshot on stroke/burst ack | `VideoActionSnapshotTrigger` + `Go2RtcBaseUrl` | `Go2RtcBaseUrl = http://127.0.0.1:1984` |
| Snapshot storage | Local disk / future Blob | **Pi USB SSD** path; optional same encryption ([24](./24-Video-Snapshot-Encryption-Checklist.md)) |
| Hardware commands | `POST /api/devices/commands` → hub | **Same** — ESP32 paired to Pi hub |

**Not required for LAN-only offline:** Cloudflare tunnel, Azure Blob, multi-Dom auth (site PIN or single local operator account may suffice).

### 8.5 ESP32 configuration (Mode B) — provisioning only

- **`server_url`** in NVS → Pi base URL (e.g. `http://192.168.1.50:5031` or `http://somnet-edge.local:5031`) — **existing `/config` field**.
- **Pairing:** operator uses **SomNet.UI on Pi** (or Swagger) → `POST /api/devices/pair` → ESP32 receives **`PairDevice`** over hub — **unchanged flow**.
- **Dual-target sites (optional):** cloud URL for normal weeks, Pi URL for outage — **LO-D10** (manual re-config vs firmware failover list); no ESP32 code required for manual swap.
- **Mode A** only if product requires control when **Pi is dead** — **LO-D9**.

### 8.6 UI options (Mode B)

| Option | Description |
|--------|-------------|
| **B1 — Full SomNet.UI on Pi** | Serve `dist/` from mini-API; operator experience closest to cloud |
| **B2 — Thin Pi dashboard** | Manual/automatic + `VideoFeed` iframes only |
| **B3 — Hybrid** | ESP32 Mode A for control; browser second tab or embedded iframe to Pi for video (discouraged UX; document only if needed) |

Prefer **B1 or B2** single origin on Pi.

### 8.7 Feasibility and constraints

| Topic | Assessment |
|-------|------------|
| Pi 4/5 8 GB running go2rtc + .NET API | **Feasible** — Phase 7 target hardware |
| Snapshot + dual USB load | **Feasible** — same as dev bench with `Go2RtcBaseUrl` pointed at Pi |
| ESP32 firmware changes for Mode B | **None** (provisioning / URL only) |
| Split command path (Pi hub + ESP32 local) | **Risky** — enforce one active path (LO-D2, LO-D9) |
| Sync history to cloud when back online | **Out of v1** — optional export |

---

## 9. CPU, dual-core, and second ESP32

### Single ESP32 (default)

All features on existing **SomNet.Device** board: relay GPIO, SignalR when reachable, HTTP, filesystem history.

### Second core (ESP32 dual-core)

Two cores share **one** RAM and flash. Second core **does not** add storage.

**Useful pattern:** FreeRTOS **`historyTask`** (lower priority) on core 0 or 1:

- `loop()` enqueues events on a **bounded queue** (non-blocking).
- Worker appends JSONL / updates index on LittleFS.

**Keep on `loop()`:** `executionContext.poll()`, relay timing, `commandHandler.poll()` — **do not** move GPIO FSM to other core without strict single-owner design.

**Hub on separate task:** Phase **12B** fallback in [Phase 12 checklist](./09-ESP32-Phase-12-Network-Hardening-Checklist.md) — only if hub + HTTP starve timing in smokes.

**MVP:** defer history task; drain queue at end of `loop()`; promote to worker if S12 jitter or UI stalls fail.

### Second ESP32 (deferred)

Possible roles: dedicated **local HMI** or **logger** over UART/SPI to relay ESP. Adds provisioning, protocol, and failure modes. **Not recommended** for this scope — use partition growth + optional history task first.

---

## 10. Resource budget (reference)

Build snapshot (dev env, pre–offline feature):

```
RAM:   ~18% (~60 KB used / 327 KB)
Flash: ~55% (~1.08 MB used / ~1.97 MB OTA slot)
```

Guideline from PARTITIONS.md: treat **>85%** of OTA slot as warning before large adds.

Offline operate estimate: **tens of KB** flash for JS + routes; history size depends on **caps**, not CPU.

---

## 11. Security and provisioning

| Topic | Guidance |
|-------|----------|
| LAN exposure | Same as today: **do not port-forward** device HTTP |
| Config UI | Still unauthenticated for Wi‑Fi; operate UI **PIN + token** |
| Setup AP | Disable local stroke endpoints in provisioning, or require PIN before any command |
| Factory reset | Clears NVS including PIN and pairing; history partition may need explicit wipe policy |

---

## 12. Open product decisions

| ID | Question | Options |
|----|----------|---------|
| **LO-D1** | Mode A: local operate **anytime on LAN** vs **only when hub down**? | Anytime + arming vs auto-detect offline |
| **LO-D2** | Cloud vs local **simultaneous** control | Reject cloud while local armed vs allow both (not recommended) |
| **LO-D3** | GPIO32 during Mode A local arm | Assert accessory line vs software-only gate |
| **LO-D4** | Pairing required for Mode A? | Require prior pair vs allow unprovisioned local-only |
| **LO-D5** | Mode A history default | On / off / caps |
| **LO-D6** | Partition change (Mode A) | Stay on minimal SPIFFS vs custom **512 KB** LittleFS |
| **LO-D7** | Mode B API shape | **Full SomNet.API on Pi (SQLite)** ★ vs trimmed vs edge-agent-only |
| **LO-D8** | Mode B auth | Site PIN vs local operator login vs reuse cloud credentials offline |
| **LO-D9** | Mode A + B together | Pi primary when up; ESP32 `/operate` fallback only vs disable Mode A when Pi healthy |
| **LO-D10** | ESP32 URL failover | Manual installer URL vs automatic cloud→Pi fallback in firmware |
| **LO-D12** | **Primary offline route** | **Pi-hosted API (Mode B)** vs ESP32 `/operate` first — **default B** |

---

## 13. Implementation phases (proposed)

### Phase E — Mode B ★ Pi-hosted API (preferred — ESP32 unchanged)

- ARM64 **`SomNet.API`** + UI on Pi; SQLite; site `appsettings`
- systemd: API + go2rtc + edge agent ([SomNet.Edge](../SomNet.Edge/))
- Commission: Wi‑Fi, ESP32 **`server_url`** → Pi, pair device to Pi, smoke stroke + video + snapshot
- Installer doc: **cloud-primary** vs **site-local API** profiles
- Optional: site backup / restore of SQLite + snapshot disk

### Phases A–D — Mode A fallback (optional ESP32 firmware)

Only if **LO-D9** requires control when Pi is down.

**Phase A — MVP**

- Local auth (PIN + token)
- Local arm/disarm
- `POST /api/local/commands`: `stroke`, `burst`, `abort`
- `/operate` manual tab + `localStorage` settings
- Accept + poll for stroke/burst completion
- Refactor `CommandHandler` validation: cloud vs local

### Phase B — Automatic

- Full automatic form + start/stop/update
- Status polling; config lock while busy (mirror cloud UX loosely)

### Phase C — History + polish

- LittleFS + partition update if needed
- History worker task if bench requires
- `/api/local/history` + simple history tab
- Link from `/` status: “Local control (offline)”
- Hardware User Guide section

### Phase D — Mode A optional

- NVS settings mirror
- Export history JSON
- Cloud sync import (separate approval)

---

## 13.1 Mode B — implications and caveats (Pi-hosted API)

| Topic | Implication |
|-------|-------------|
| **Two deployments** | Cloud Azure + per-site Pi image — version skew; define **release train** (same git tag on both). |
| **Database** | SQLite on Pi — backup, corruption recovery, no Azure SQL geo-redundancy. |
| **Users / auth** | Site-local users in Pi DB; not the same login DB as cloud unless sync added later. |
| **Remote operator** | LAN Mode B works on-site Wi‑Fi; **off-site** still needs **tunnel to Pi** (Cloudflare) or cloud return — same as Phase 7 split-origin. |
| **Pairing state** | Device JWT on ESP32 is for **one** API issuer; re-pair when switching cloud ↔ Pi if JWT keys differ. |
| **Blob / Azure-only features** | Use disk on Pi; Phase 8 Azure Blob optional for cloud only. |
| **P16 / session-accessory** | **Unchanged** — still driven by UI + API on whichever host ESP32 is paired to. |

**Not a showstopper:** ESP32 already supports LAN API URLs and outbound hub client — this is **hosting**, not **device** engineering.

---

## 14. Verification (outline)

| # | Scenario | Pass criteria |
|---|----------|---------------|
| L1 | Hub **down**, LAN up, unlock, stroke | Relay fires; HTTP result matches `actualStrokeMs` band |
| L2 | Hub **up**, local armed | Policy per LO-D1/D2 — no undefined double control |
| L3 | Burst long run | HTTP returns quickly; poll completes with `strokesCompleted` |
| L4 | Automatic start → stop | Idle + summary fields in poll/`resultJson` |
| L5 | Automatic-update mid-session | Replan serial / behavior matches Phase 11 |
| L6 | Transport loss during local session | Policy per LO-D3 — strokes stop or continue as designed |
| L7 | History rotation | Caps enforced; no `loop()` stall beyond S12 budget |
| L8 | Regression | SignalR stroke/burst/automatic unchanged when local idle |

**Mode B (additions):**

| # | Scenario | Pass criteria |
|---|----------|---------------|
| L9 | Cloud down; Pi API up; ESP32 → Pi hub | Stroke + ack; snapshot JPEGs on Pi disk |
| L10 | LAN browser; no tunnel | Live front/rear MSE from Pi go2rtc with session token |
| L11 | Pi down; ESP32 up | Mode A fallback per LO-D9 |

Reuse **S12 relay jitter** from [Phase 12](./09-ESP32-Phase-12-Network-Hardening-Checklist.md) after local features land.

---

## 15. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| P16 fail-safe blocks offline intent | Local ingress + arm policy (§4.4) |
| UI rule drift vs SomNet.UI | PROTOCOL + test vectors; document defaults |
| Flash wear / corrupt history | JSONL append, rotate, atomic index write |
| `loop()` starvation | Hub budget (12A); history queue; 12B only if needed |
| Long HTTP timeouts | Accept + poll (§4.6) |
| Two operators / tabs | Single token optional; last unlock wins |
| Mode A + B both fire commands | LO-D9; single hub authority |
| Two deployment profiles (Azure vs Pi API) | Installer guide; clear NVS `server_url` |
| Pi disk full (snapshots) | Rotation / lifecycle on site SSD |

---

## 16. Document history

| Date | Change |
|------|--------|
| 2026-09-24 | Initial design from feasibility / scope / history / dual-core discussion |
| 2026-09-24 | Added **Mode B** — Pi mini-API + go2rtc for offline video/images; clarified Mode A vs B |
| 2026-09-24 | **Mode B preferred** — Pi-hosted **cloud-equivalent API**; ESP32 unchanged; Mode A optional fallback |
| 2026-09-24 | **§0 Three operating profiles** — tier 1 (online), tier 2 (Mode B), tier 3 (Mode A); comparison table + nuances + priority |
| 2026-09-24 | Renamed doc title to **Site operating profiles**; tier summary validated with stakeholders |
