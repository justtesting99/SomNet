# ESP32 Firmware — Phase 7 Checklist

**Resilience and production prep** — token expiry → unpaired fallback, cloud **`wss://`** build profile, hub loop watchdog, config UI visual alignment with SomNet web app, documentation polish, and reconnect/soak verification.

**Parent plan:** [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §4 *Config UI — visual styling*, §7, §10, §14  
**Protocol reference:** [`SomNet.Device/docs/PROTOCOL.md`](../SomNet.Device/docs/PROTOCOL.md)  
**Prior phase:** [09-ESP32-Phase-6-Checklist.md](./09-ESP32-Phase-6-Checklist.md) (**Signed off** 2026-09-05)  
**Status:** **In progress** — config UI theme (P7-D10) implemented 2026-09-05; firmware `0.7.0-phase7`  
**Target output:** Firmware **`0.7.0-phase7`** — survives API restart and Wi‑Fi blip; reconnects without manual re-pair when token valid; `env:prod_cloud` negotiates **`wss://`**; config pages visually aligned with SomNet UI theme

---

## Phase 7 at a glance

| Item | Value |
|------|--------|
| **Goal** | Production-hardening: auth lifecycle, TLS transport, loop health, installer-facing polish |
| **Duration** | 2–3 days |
| **Hardware scope** | Same DevKit; optional oscilloscope on **D4** (carry-forward — not blocking) |
| **Software scope** | `signalr_client`, `nvs_store`, `platformio.ini`, `config_pages.*`, `main.cpp`, docs |
| **Explicitly out of scope** | SomNet UI command wiring (Phase 8), `resultJson` on API wire, burst/automatic (Phase 9), `GET /api/devices/unpaired`, certificate pinning policy (open decision §15) |
| **Blocks** | Phase 8 benefits from stable reconnect + cloud profile; installers benefit from styled config UI |

Update **Status** above and check boxes below as work completes. When Phase 7 is done, update [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 Phase 7.

---

## Prerequisites

### Completed upstream

- [x] Phase 6 **Signed off** — [09-ESP32-Phase-6-Checklist.md](./09-ESP32-Phase-6-Checklist.md)
- [x] `stroke` relay E2E on hardware (`esp32-84CCA85C36B4` / Sub `Slv66`)
- [x] [Hardware User Guide](./Hardware-User-Guide.md) updated (relay, pairing path)
- [x] [06-SignalR-And-Hardware.md](./06-SignalR-And-Hardware.md) synced with Phases 0–6
- [ ] Review plan §4 *Config UI — visual styling* — extract SomNet UI colors for PROGMEM CSS
- [ ] Review plan §7 *Reconnection strategy* — token expired / revoked paths
- [ ] Review `signalr_client.cpp` — current `TLS/wss not supported until Phase 7` gate (line ~158)

### Developer environment

- [ ] SomNet API running (local `http://` for dev tests)
- [ ] Optional: Azure/cloud API with **`https://`** for `prod_cloud` / `wss` verification
- [ ] ESP32 on same LAN; serial 115200 baud
- [ ] Paired test Sub (e.g. **`Slv66`**)
- [ ] Ability to stop/start API and Wi‑Fi AP for resilience tests

### Module state (entering Phase 7)

| Module | Current behavior | Phase 7 change |
|--------|------------------|----------------|
| `nvs_store` | Stores `token_expires` ms from `PairDevice` | **Use** expiry before paired connect |
| `signalr_client` | Rejects TLS/`use_tls`; type-7 → `clearPairing()` | Expiry check; **`wss`** + `WiFiClientSecure` in `prod_cloud` |
| `config_pages.cpp` | Minimal inline CSS (~15 lines PROGMEM) | Shared theme CSS — slate/indigo palette |
| `platformio.ini` | `env:dev` only; `prod_cloud` commented | Enable **`env:prod_cloud`** with `SOMNET_USE_WSS` |
| `main.cpp` | Cooperative loop + `yield()` | Optional **watchdog** feed / health metrics |

---

## Carry-forward from Phase 6 (optional)

Not required for Phase 7 exit unless you choose to close timing calibration in this phase.

| Item | Status | Notes |
|------|--------|-------|
| Oscilloscope on **D4** | Deferred | [Phase 6 post sign-off](./09-ESP32-Phase-6-Checklist.md#post-sign-off--timing-calibration-deferred) |
| Fixed offset on `strokeMs` | **TBD after scope** | Only if systematic error confirmed |
| Abort / busy E2E | Phase 8 | Swagger REST is synchronous |

---

**Decisions locked (2026-09-05):** See table below. **Local-first:** Phase 7 exit on `ws://` LAN; `prod_cloud` compiles but Azure/wss E2E deferred until deployment.

---

## Decisions (locked 2026-09-05)

| # | Decision | Options | Choice | Date |
|---|----------|---------|--------|------|
| P7-D1 | **Token expiry handling** | Ignore until hub rejects / check `token_expires` before paired WS | ☑ Check NVS `token_expires` before paired connect; if expired → `clearPairing()` → unpaired reconnect | 2026-09-05 |
| P7-D2 | **Expiry clock source** | `millis()` only / **NTP or `time()` after Wi‑Fi** | ☑ **SNTP once after Wi‑Fi up** (`configTime` + `pool.ntp.org`); expiry check only when time synced; else rely on type-7 fallback | 2026-09-05 |
| P7-D3 | **Expiry skew buffer** | 0 / **5 min** before `exp` | ☑ **5 minutes** — treat as expired if `now >= expiresMs - 5min` | 2026-09-05 |
| P7-D4 | **Revoked token (type 7 / auth fail)** | Already `clearPairing()` | ☑ Keep behavior; unify log → `[HUB] token rejected — unpaired` | 2026-09-05 |
| P7-D5 | **`wss` implementation** | Raw mbedTLS / **`WiFiClientSecure` + WebSockets** | ☑ **`WiFiClientSecure` + `WebSocketsClient`** (links2004 API) | 2026-09-05 |
| P7-D6 | **TLS cert validation (prod)** | Insecure (dev) / CA store / pin cert / **defer Azure E2E** | ☑ **Local-first:** `env:dev` stays `ws://`; implement `prod_cloud` + `wss` **build-only** (`setInsecure()` stub); **no Azure E2E until deployment** — not blocking Phase 7 sign-off | 2026-09-05 |
| P7-D7 | **`prod_cloud` env** | Name + `extends = env:dev` | ☑ `[env:prod_cloud]` extends `dev`, `-D SOMNET_USE_WSS=1` | 2026-09-05 |
| P7-D8 | **Negotiate URL for TLS** | `https://host/.../negotiate` when `use_tls` or `https://` server URL | ☑ Same `parseServerUrl()` — `https://` → negotiate over HTTPS + `wss://` WS | 2026-09-05 |
| P7-D9 | **Watchdog** | None / Task WDT reset each loop / disable during long pulse | ☑ **No new WDT logic** — cooperative loop returns every iteration (non-blocking FSM); add heap/heartbeat log during soak; revisit only if WDT resets observed | 2026-09-05 |
| P7-D10 | **Config UI theme** | Light readable / **dark slate + indigo** (match SomNet UI) | ☑ **Dark slate + indigo** — match SomNet web app | 2026-09-05 |
| P7-D11 | **CSS budget** | Max PROGMEM size for shared style block | ☑ ≤ **8 KB** shared style; ≤ **20 KB** total HTML+CSS per page (plan §4) | 2026-09-05 |
| P7-D12 | **Firmware version** | e.g. `0.7.0-phase7` | `0.7.0-phase7` | 2026-09-05 |
| P7-D13 | **Soak test duration** | 8 h / **24 h** | ☑ **8 hours** — reconnect + heap stability on local `ws://` | 2026-09-05 |
| P7-D14 | **Test Sub** | e.g. `Slv66` | `Slv66` | 2026-09-05 |
| P7-D15 | **Flash partition table** | `default` / **`min_spiffs.csv`** / custom | ☑ **`min_spiffs.csv`** — dual OTA ~1.9 MB/slot; SPIFFS unused | 2026-09-05 |

**Reference — SomNet UI theme (extract for PROGMEM CSS):**

| Token | Approximate value | Tailwind reference |
|-------|-------------------|-------------------|
| Page background | `#020617` | `slate-950` |
| Card / panel | `#0f172a` | `slate-900` |
| Border | `#334155` | `slate-700` |
| Body text | `#cbd5e1` | `slate-300` |
| Primary button | `#4f46e5` → hover `#6366f1` | `indigo-600` / `indigo-500` |
| Font | Segoe UI, system-ui | `tailwind.config.js` |

### Rationale notes

**P7-D1–D3 (expiry):** `token_expires` is already in NVS from `PairDevice` but never checked. JWT expiry is wall-clock (365-day tokens today). SNTP after Wi‑Fi gives `time()` for comparison; 5‑minute buffer avoids connecting with a token about to expire mid-session.

**P7-D6 (local-first / Azure defer):** Deferring cloud E2E is **not a bad decision**. Phase 7 still adds the `wss` code path and `pio run -e prod_cloud` so cloud deploy is not a surprise rewrite. Sign-off uses local `http://` + `ws://`. When Azure is available: flip server URL to `https://`, flash `prod_cloud`, replace `setInsecure()` with proper CA store (open decision §15), run wss E2E — can be Phase 7 post-sign-off or pre-production gate.

**P7-D9 (watchdog):** Relay strokes are non-blocking — `loop()` returns every iteration with `yield()`. No 30 s blocking wait. Extra WDT logic adds risk without evidence of resets.

**P7-D13 (8 h soak):** Shorter than plan default (24 h) but sufficient to catch reconnect/backoff bugs overnight; document start/end timestamps in sign-off.

**P7-D15 (partitions):** Default `esp32dev` profile used ~1.28 MB OTA slots (firmware at **79.9%**). **`min_spiffs.csv`** raises each slot to ~**1.97 MB** (**53.3%** same binary). Required before OTA + `wss` + Phase 9 growth. Documented in [`PARTITIONS.md`](../SomNet.Device/docs/PARTITIONS.md). **One full reflash** after switching tables.

---

## A. Token expiry → unpaired fallback

- [x] `NvsStore::getTokenExpires()` used before attempting paired WebSocket
- [x] If expired (per P7-D1/D3): `clearPairing()`; log; `gUsePairedConnect = false`
- [x] Reconnect as unpaired (`?deviceId=`) — wait for new `PairDevice`
- [x] Status page shows **unpaired** after expiry (config UI — reads `nvs.isPaired()`)
- [x] Serial: `[HUB] token expired — clearing pairing`
- [x] **Verify:** Set `"DeviceExpireMinutes": 10` (not `ExpireMinutes` — that is UI login only) in `appsettings.Development.json`, restart API, re-pair, wait ~5 min → `[HUB] token expired — clearing pairing` on serial and **not paired** on UI — **passed 2026-09-05** (`esp32-84CCA85C36B4` / Slv66; expiry diag countdown; stable unpaired reconnect, no re-pair loop)

**Existing code paths to extend:**

- `signalr_client.cpp` — expiry check in `poll()` before negotiate; type-7 log unified (P7-D4)
- `wifi_manager.cpp` — SNTP once after Wi‑Fi up (`configTime` + `pool.ntp.org`); `isTimeSynced()` gates expiry check
- `nvs_store.cpp` — `getTokenExpires()`, `clearPairing()`
- Type **7** close calls `clearPairing()` on auth rejection — log `[HUB] token rejected — unpaired`

---

## B. `wss://` / `prod_cloud` build profile

- [x] Uncomment / implement `[env:prod_cloud]` in `platformio.ini` (P7-D7)
- [x] `build_flags`: `-D SOMNET_USE_WSS=1` (or equivalent in `config.h`)
- [x] `negotiateConnectionToken()`: **`https://`** when TLS (P7-D8)
- [x] WebSocket: **`wss://`** with `WiFiClientSecure` (P7-D5) — `beginSSL()` + `setInsecure()` on negotiate
- [x] Remove or guard `[HUB] TLS/wss not supported until Phase 7` message — dev build hints to flash `prod_cloud`
- [x] `server_url` with `https://` sets `use_tls` in NVS (existing config UI path — verify)
- [x] **`pio run -e prod_cloud`** succeeds (compile-only — no Azure E2E per P7-D6) — **2026-09-05:** Flash 53.7%, RAM 15.4%
- [x] Document cloud flash command in `SomNet.Device/README.md`

**Out of scope for first pass:** Custom cert pinning — use `setInsecure()` in `prod_cloud` until Azure deployment; document in README (P7-D6).

**Phase 7 sign-off does not require** cloud `wss` E2E — carry-forward when Azure is available.

---

## C. Watchdog and hub loop health

- [ ] Choose strategy (P7-D9) — document in README if WDT disabled during pulse
- [ ] Hub `poll()` + main `loop()` cannot stall > WDT timeout (default ~5 s on ESP32)
- [ ] Long `stroke` (e.g. 30 s): WDT must not reset device mid-pulse
- [ ] Optional: serial heartbeat every N minutes during soak (`[HUB] alive`, heap free)
- [ ] Optional: log `[HUB] reconnect` count after resilience tests

---

## D. Config UI visual alignment

Target pages: **`/`**, **`/config`**, POST “Saved — rebooting” response.

- [x] Extract shared PROGMEM CSS block in `config_pages.cpp` (P7-D10)
- [x] Apply theme: dark background, card panels, indigo primary buttons, readable form fields
- [x] Phone-friendly single column (existing — preserve)
- [x] Device ID remains prominent (`device-id` monospace block)
- [x] HTML buffers increased for shared CSS (`config_web_server.cpp`)
- [x] Total HTML+CSS within RAM budget (P7-D11) — shared CSS ~1.5 KB PROGMEM; pages fit in 5120/2560 buffers
- [x] **Visual check:** user confirmed themed UI on device (2026-09-05)

**Build footprint (`pio run -e dev`, `min_spiffs.csv`, 2026-09-05):**

| Resource | Used | Total (per OTA slot) | % | Notes |
|----------|------|----------------------|---|--------|
| **RAM** (static + `.data`/`.bss`) | 50 544 B | 327 680 B | **15.4%** | Comfortable headroom for hub + HTTP + relay FSM |
| **Flash** (one OTA slot) | 1 047 377 B | 1 966 080 B | **53.3%** | ~919 KB free per slot — room for OTA client, `wss`, Phase 9 |

**Prior (`default.csv`):** 79.9% of 1 310 720 B (~263 KB free) — replaced by P7-D15.

**Guideline:** warn when flash **>85%** of one OTA slot. See [PARTITIONS.md](../SomNet.Device/docs/PARTITIONS.md).

**Out of scope:** Dark-mode toggle, external CDN, JS frameworks, pixel-perfect clone.

---

## D2. Flash partition table (OTA headroom)

- [x] `board_build.partitions = min_spiffs.csv` in `platformio.ini` (P7-D15)
- [x] `pio run` succeeds; Flash report shows ~**1 966 080** B slot size
- [x] [docs/PARTITIONS.md](../SomNet.Device/docs/PARTITIONS.md) — rationale, monitoring, OTA notes
- [x] [SomNet.Device/README.md](../SomNet.Device/README.md) — Flash and partitions section
- [x] Parent plan §10 Phase 7 + hardware table updated
- [x] **One full reflash** on hardware after partition change — NVS + pairing survived (`esp32-84CCA85C36B4`, 2026-09-05)

---

## E. Documentation

- [x] [docs/PARTITIONS.md](../SomNet.Device/docs/PARTITIONS.md) — flash layout, OTA headroom (P7-D15)
- [ ] `SomNet.Device/README.md` — `prod_cloud` build, resilience notes, wiring diagram (ASCII or linked image)
- [ ] `SomNet.Device/README.md` — registration / pairing procedure pointer to Hardware User Guide
- [ ] [Hardware User Guide](./Hardware-User-Guide.md) — cloud `https://` server URL note (if prod tested)
- [ ] Parent plan §10 Phase 7 status → **Complete** or **Signed off**
- [ ] [Documents/README.md](./README.md) — Phase 7 checklist status updated

**Optional:** Simple wiring diagram (DevKit → relay module D4, button D33):

```
ESP32 D4  ──► relay IN
ESP32 GND ──► relay GND
ESP32 3V3/5V ──► relay VCC (per module spec)
D33 ──► button ──► GND (internal pull-up)
```

---

## F. Resilience verification tests

### F.1 API restart

- [x] Device paired + hub connected
- [x] Stop SomNet API ≥ 30 s; restart
- [x] Device reconnects automatically (serial backoff → negotiate → paired)
- [x] `GET /api/devices/status` → `isConnected: true` without re-pair
- [x] `stroke` command still works after recovery — verified 2026-09-06 (post F.1/F.4)

### F.2 Wi‑Fi blip

- [x] Disable Wi‑Fi or reboot AP ≥ 30 s
- [x] Device reconnects Wi‑Fi then hub
- [x] No manual re-pair if token still valid

### F.3 Token revoke

- [x] `DELETE /api/devices/pair?subTarget=Slv66`
- [x] Device receives close / fails paired auth → unpaired mode
- [x] Re-pair from Options succeeds

### F.4 Config HTTP + SignalR concurrent

- [x] While hub connected, open `http://<device-ip>/` and `/config` from phone
- [x] Pages load; no hub disconnect during browse
- [x] Save config (test unit) → reboot → still pairs if token retained

### F.5 Soak test (P7-D13 — 8 hours)

- [ ] Run device **8 h** — API up on LAN (`ws://`), optional stroke every ~30–60 min — **started ~2026-09-06 20:44 local**; user monitoring, report failures only
- [ ] Log: reconnect count, heap minimum, any WDT resets
- [ ] Exit: hub connected or stable backoff; no crash loop

| Test | Pass? | Date |
|------|-------|------|
| API restart → auto reconnect | ☑ | 2026-09-06 |
| Wi‑Fi blip → auto reconnect | ☑ | 2026-09-06 |
| Revoke → unpaired → re-pair | ☑ | 2026-09-06 |
| Config UI + hub concurrent | ☑ | 2026-09-06 |
| `prod_cloud` build (compile-only; wss E2E when Azure ready) | ☑ | 2026-09-05 |
| 8 h soak (local ws) | ☐ | |
| Token expiry → unpaired | ☑ | 2026-09-05 |

**Verification notes:**

```
Device ID: esp32-84CCA85C36B4
Sub target: Slv66
Firmware: 0.7.0-phase7
Token expiry test: 2026-09-05 — expiry diag ~569→329 s; clear at ~29 s buffer; unpaired WS stable (handshake ok), no PairDevice re-delivery loop
F.1 API restart: 2026-09-06 — single disconnect; backoff 2→32 s; fresh negotiate token; handshake ok paired; no re-pair (same JWT)
F.2 Wi-Fi blip: 2026-09-06 — link lost; Wi-Fi retry 10→20 s; reconnected; hub negotiate + handshake ok; same JWT
F.3 Revoke/re-pair: 2026-09-06 — RevokePairing → clearing; unpaired WS; re-pair + handshake ok
F.4 Config + hub: 2026-09-06 — friendly name save (drewtest2); reboot; paired retained; handshake ok; HTTP served during hub
prod_cloud tested against: compile-only (Flash 53.7%, RAM 15.4%) — Azure wss E2E deferred
Soak start / end: started ~2026-09-06 20:44 local (8 h) / (pending)
Reconnect events: (pending)
```

---

## G. Optional — timing calibration (Phase 6 carry-forward)

- [ ] Oscilloscope capture on D4 for 200 ms and 5000 ms stroke
- [ ] If systematic error > agreed threshold: fixed offset in `relay_controller` (document in README)
- [ ] If within tolerance: note “no offset applied” in sign-off

**Default:** Defer again with explicit sign-off note — not blocking Phase 7 exit.

---

## H. Architecture compliance

- [ ] No `delay()` in hub or relay paths (except brief setup)
- [ ] Phase 6 stroke / abort / relay FSM unchanged in behavior (unless offset added in G)
- [ ] Burst/automatic stubs untouched
- [ ] Single cooperative `loop()` — no new FreeRTOS timing tasks unless justified
- [ ] PROGMEM-only assets — no SPIFFS requirement for theme

---

## I. Out of scope (do not merge in Phase 7)

- [ ] Confirmed **not** started: UI `POST /api/devices/commands`, `resultJson` DTO, burst/automatic modes
- [ ] Confirmed **not** started: `GET /api/devices/unpaired`, dedicated pairing dialog (Phase 8)
- [ ] Confirmed **not** started: OTA updates, offline command queue, BLE provisioning

---

## J. Deliverables

- [x] Token expiry check + unpaired fallback
- [x] `env:prod_cloud` + `wss` path (verified at least build; cloud E2E if available)
- [ ] Watchdog strategy implemented and documented
- [ ] Config UI theme CSS applied to `/`, `/config`, saved page
- [ ] README + cross-doc updates (§E)
- [x] `platformio.ini` → `min_spiffs.csv` + `0.7.0-phase7`
- [x] [PARTITIONS.md](../SomNet.Device/docs/PARTITIONS.md)
- [ ] Parent plan §10 Phase 7 status updated
- [ ] This checklist status → **Complete** or **Signed off**

---

## Phase 7 exit sign-off

| Criterion | Done |
|-----------|------|
| Survives API restart; reconnects without re-pair (valid token) | ☑ |
| Survives Wi‑Fi blip; hub restores | ☑ |
| Expired / revoked token → unpaired fallback | ☑ |
| `prod_cloud` builds; wss path documented (**E2E deferred** — P7-D6) | ☑ |
| Config UI visually aligned with SomNet theme (or deferred with sign-off) | ☐ |
| Soak test completed per P7-D13 (**8 h** local) | ☐ |
| Decisions P7-D1–D14 recorded | ☑ 2026-09-05 |
| No out-of-scope features merged (§I) | ☐ |
| Ready for Phase 8 (UI commands + pairing polish) | ☐ |

**Completed by:**  
**Date:**

---

## Next phase

→ [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) §10 **Phase 8 — SomNet UI pairing and command integration**

**Phase 8 carry-forward:** `abort` dual-ack and busy reject E2E; `resultJson` on API wire; replace simulated UI ack; **pairing token expiry display** (early Options `DevicePairingPanel` — carry to dedicated dialog); **Dom all-Subs hardware admin** table with expiry + yellow/red highlighting (2026-09-05 note).

Future phase checklists:

| Phase | Checklist document | Status |
|-------|-------------------|--------|
| 0–5 | Prior checklists | Complete |
| 6 | [09-ESP32-Phase-6-Checklist.md](./09-ESP32-Phase-6-Checklist.md) | **Signed off** 2026-09-05 |
| 7 | This document | Not started |
| 8+ | *Created when prior phase completes* | — |
