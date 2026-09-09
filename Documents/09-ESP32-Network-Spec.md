# ESP32 Network Layer — Specification

**Status:** **Locked for implementation** (2026-09-09) — decisions and behaviour contract; firmware refactor pending.

| Related | Link |
|---------|------|
| Parent plan | [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) |
| Operator setup | [Hardware-User-Guide.md](./Hardware-User-Guide.md) |
| Hub protocol | [06-SignalR-And-Hardware.md](./06-SignalR-And-Hardware.md) |
| Phase 11 (blocked on network stability) | [09-ESP32-Phase-11-Checklist.md](./09-ESP32-Phase-11-Checklist.md) |
| Firmware source | [SomNet.Device/README](../SomNet.Device/README.md) |

**Purpose:** Define how SomNet ESP32 firmware handles **Wi‑Fi**, **LAN config HTTP**, and **SignalR hub** connectivity using **tried-and-tested embedded patterns** — not ad‑hoc stop/start or Wi‑Fi refresh rules layered on top of each other.

**Scope:** `SomNet.Device` — `main.cpp`, `wifi_manager`, `config_web_server`, `signalr_client`, `nvs_store`, `button_input`, `include/config.h`.

**Out of scope:** OTA; TLS/cloud deploy (`prod_cloud`); API firewall scripts (host PC); router/DHCP policy (except notes).

---

## 1. Locked decisions

These are **not** open for re-litigation during implementation unless a smoke test proves a decision wrong.

| ID | Decision | Rationale |
|----|----------|-----------|
| **NET-D1** | **Setup AP is the provisioning path** when the device has no valid saved Wi‑Fi credentials (first boot, credential reset after reboot, or repeated STA failure recovery). | Standard ESP32/IoT pattern; device cannot appear on home LAN without credentials. |
| **NET-D2** | **STA + LAN config UI** is the normal running path after provisioning. Operator on the same LAN uses the device DHCP address (e.g. `http://192.168.1.172/`). | Day‑to‑day reconfiguration without joining the setup AP. |
| **NET-D3** | **Three independent concerns:** Wi‑Fi link FSM, HTTP config server, hub client FSM. Failures at one layer must not be “fixed” by tearing down another layer. | Prevents API-down from killing Wi‑Fi/HTTP; single-threaded discipline. |
| **NET-D4** | **HTTP server starts once** per boot (per mode) and is **never** stop/started to recover from hub TCP failures. | `AsyncWebServer` on ESP32 does not survive arbitrary teardown; matches library usage elsewhere. |
| **NET-D5** | **Hub transport failure ≠ Wi‑Fi failure.** `refreshAssociation()` and credential clear apply only to **link-layer** problems. | Industry norm for MQTT/WebSocket clients on Wi‑Fi MCUs. |
| **NET-D6** | **HTTP is not gated on hub connected.** Short settle after STA IP only; hub state is informational on `/`. | Config UI must stay available during API outages. |
| **NET-D7** | **Main loop order:** `wifiManager` → `configWebServer` → `signalRClient` (HTTP before blocking hub work each iteration). | Gives AsyncWebServer a slice before synchronous negotiate. |

---

## 2. Platform constraints (honest)

The ESP32 Arduino framework runs application logic primarily in **`loop()`** on one task. Implications:

| Constraint | Rule |
|------------|------|
| Blocking calls freeze everything | Hub `HTTPClient` negotiate, long TCP probes, and `delay()` block HTTP, button, relay FSMs, and LED updates for their duration. |
| AsyncWebServer is cooperative | It requires regular returns to `loop()`; starvation looks like “server started” in serial but no `[HTTP] GET` lines. |
| One Wi‑Fi mode at a time for running life | **STA only** when provisioned; **Setup AP** only in provisioning phases. |
| Memory | Single static `AsyncWebServer` instance; routes registered once at start. |

**Acceptable for v1:** Brief blocking hub negotiate (≤3 s) **after** HTTP is already listening, with **infrequent** retries when API is down (quiet probe + backoff).

**Future upgrade (not v1):** Dedicated FreeRTOS task for hub I/O if zero UI stall is required — proper scaling step, not HTTP stop/start hacks.

---

## 3. Lifecycle phases

### Phase A — Provisioning (Setup AP)

**Entry conditions (any):**

- No NVS Wi‑Fi + server (`!isFullyProvisioned()` and no allowed `secrets.ini` fallback)
- `cred_reset` flag set after button credential reset and reboot
- STA failed `kWifiConnectFailuresBeforeRecovery` times → clear provisioning → Setup AP

**Behaviour:**

1. Soft AP SSID: **`SomNetSetup-XXXX`** (last 4 chars of device ID)
2. Password: **`somnetsetup`** (WPA2)
3. AP IP: **`192.168.4.1`**
4. Captive DNS: `*` → `192.168.4.1` (phones)
5. HTTP starts **immediately** on port **80**
6. Operator opens **`http://192.168.4.1/`** → `/config` → Wi‑Fi SSID, password, server URL → Save → reboot

**Exit:** NVS `provisioned=true`, valid `wifi_ssid` + `server_url`, `cred_reset` cleared → Phase B on next boot.

**Operator doc:** [Hardware User Guide — First-time setup](./Hardware-User-Guide.md#first-time-setup) (SSID naming in user guide should match **`SomNetSetup-XXXX`** — sync when implementing).

---

### Phase B — STA running (normal)

**Entry:** Valid NVS credentials (or non–cred-reset `secrets.ini` fallback); boot mode **Running**.

**Behaviour:**

1. **Wi‑Fi FSM:** Join configured SSID; exponential backoff on connect timeout; reconnect on link loss only.
2. **HTTP:** Start **once** within **`CONFIG_HTTP_STA_SETTLE_MS`** (see §6) after STA has IP — **regardless of hub state**.
3. **Hub FSM:** After boot settle + optional SNTP (paired), negotiate → WebSocket → handshake → paired/unpaired.
4. **Target:** Hub connected within **≤ 120 s** under normal LAN + API up (retries included).

**Config UI:** `http://<dhcp-ip>/` (e.g. `.172` if router assigns it). Same LAN as operator PC/phone **without** joining setup AP.

---

### Phase C — API unavailable, Wi‑Fi up

**Entry:** Hub receives connection refused / unreachable API on configured host while STA connected.

**Behaviour:**

1. **Wi‑Fi:** Unchanged — stay associated.
2. **HTTP:** Unchanged — keep serving; operator can still open status and `/config`.
3. **Hub:** Enter **`serverUnavailable_`** (application backoff):
   - Log throttled (see §8)
   - Retry interval: **`HUB_SERVER_UNAVAILABLE_RETRY_MS`**
   - Use **quiet TCP probe** only while in this state (no full negotiate storm)
   - **No** `refreshAssociation()`
   - **No** HTTP stop/start

**Exit:** Quiet probe succeeds → resume normal negotiate/WebSocket path.

---

### Phase D — Wi‑Fi link lost

**Entry:** `WL_DISCONNECTED`, connect timeout, or explicit link loss while in STA.

**Behaviour:**

1. **Hub:** Idle / offline; disconnect WebSocket without treating as pairing loss.
2. **Wi‑Fi FSM:** Reconnect with backoff.
3. **HTTP:** While disconnected, cannot serve; on **link restored** (`takeLinkRestored()`):
   - Hub resets reconnect state (existing `onWifiLinkRestored()`)
   - HTTP: if never started, start after settle; if already started, **do not** re-register routes or call `end()`/`begin()` unless proven necessary (default: leave listening)

---

## 4. Module responsibilities

### 4.1 `main.cpp`

| Responsibility | Detail |
|----------------|--------|
| Boot mode | Provisioning vs Running from NVS + `cred_reset` + `secrets.ini` |
| `startNetwork()` | Provisioning → `beginSoftAp()`; Running → `beginStation()` |
| `tryWifiRecovery()` | After N STA failures → clear provisioning → Setup AP |
| Loop order | `wifiManager.poll()` → `tryWifiRecovery()` → **`configWebServer.poll()`** → **`signalRClient.poll()`** → rest |

### 4.2 `WifiManager` (link layer only)

| Responsibility | Detail |
|----------------|--------|
| STA connect / retry | Non-blocking state machine; `WIFI_PS_NONE` |
| Setup AP | WPA2, captive DNS, event logging |
| SNTP | Start after STA connect; paired hub may wait up to `SNTP_SYNC_TIMEOUT_MS` |
| ARP helpers | `pokeHostArp`, `isHostArpResolved` — for hub, not for Wi‑Fi recovery |
| `refreshAssociation()` | **Only** from hub when **not** `serverUnavailable_` and **not** “API host on LAN with link up” — i.e. genuine transport recovery after **non–application** failures, or explicit Wi‑Fi healing |

**Must not:** Call `refreshAssociation()` because TCP to port 5031 failed.

### 4.3 `ConfigWebServer` (LAN UI)

| Responsibility | Detail |
|----------------|--------|
| Routes | `/`, `/config`, `/ping`, `/api/status`, reset endpoints, captive probes (AP only) |
| Start | Once when `wifi_->isConnected()` and settle elapsed (STA) or immediately (AP) |
| Persistence | POST `/config` → NVS → reboot |
| Logging | `[HTTP] GET /path from x.x.x.x` on each request |

**Must not:** Stop/restart server on hub events; defer start until hub connected.

### 4.4 `SignalRClient` (application layer)

| Responsibility | Detail |
|----------------|--------|
| States | Offline → Backoff → Negotiating → Connecting → Handshaking → Paired/Unpaired |
| Negotiate | HTTP POST to `{server_url}/hubs/hardware/negotiate?negotiateVersion=1` |
| WebSocket | SignalR handshake + command dispatch (existing) |
| Backoff | Exponential 1 s → 60 s cap on generic failures |
| Server unavailable | Dedicated backoff + quiet probe (Phase C) |
| Stall recovery | 90 s without healthy hub → reconnect hub **without** Wi‑Fi refresh if server unavailable |
| SNTP gate | Paired devices wait for SNTP start/sync/timeout before first negotiate |

**Must not:** Couple to `ConfigWebServer` for repair; block loop in tight retry loops.

### 4.5 `NvsStore` / `ButtonInput`

| Event | NVS effect | Next boot |
|-------|------------|-----------|
| POST `/config` | Save wifi, server, `provisioned=true`, clear `cred_reset` | Running / STA |
| Button 10 s hold | `clearProvisioning()`, set `cred_reset` | After release → reboot → Provisioning / Setup AP |
| POST `/config/reset-wifi` | Same as clear provisioning | Reboot → Setup AP |
| 5× STA failure | `clearProvisioning()` via main | Setup AP |

**Note:** Between 10 s hold and button release, device may still be on home STA briefly; saving at LAN IP before release is possible but **not** the primary documented operator path — **Setup AP after reboot is canonical** (NET-D1).

---

## 5. Architecture diagram

```text
                    ┌─────────────────────────────────────┐
                    │           main loop()               │
                    └─────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
   ┌─────────────┐            ┌──────────────┐            ┌─────────────┐
   │ WifiManager │            │ ConfigWeb    │            │ SignalR     │
   │  (link)     │            │ Server (UI)  │            │ Client (app)│
   ├─────────────┤            ├──────────────┤            ├─────────────┤
   │ STA / AP    │            │ AsyncWeb :80 │            │ HTTP neg.   │
   │ reconnect   │            │ once/start   │            │ WebSocket   │
   │ SNTP, ARP   │            │ no hub gate  │            │ backoff     │
   └─────────────┘            └──────────────┘            └─────────────┘
          │                           │                           │
          │    Wi‑Fi down only        │    never torn down        │
          │◄──────────────────────────┴──────────────────────────►│
          │              API down: hub backs off only             │
          └───────────────────────────────────────────────────────┘
```

---

## 6. Timing constants (target)

Values to codify in `include/config.h` during implementation. Adjust only with smoke-test evidence.

| Constant | Value | Purpose |
|----------|-------|---------|
| `CONFIG_HTTP_STA_SETTLE_MS` | **3000** | Start LAN HTTP this long after STA has IP |
| `CONFIG_HTTP_PORT` | 80 | Config UI |
| `WIFI_CONNECT_TIMEOUT_MS` | 30000 | STA give up → retry |
| `WIFI_RETRY_BASE_MS` / `MAX` | 5000 / 60000 | STA backoff |
| `kWifiConnectFailuresBeforeRecovery` | 5 | Then Setup AP |
| `HUB_BOOT_SETTLE_MS` | 2500 | Before first hub attempt (warm boot) |
| `HUB_COLD_BOOT_SETTLE_MS` | 8000 | Power-on / brownout |
| `SNTP_SYNC_TIMEOUT_MS` | 30000 | Then hub proceeds anyway |
| `HUB_NEGOTIATE_TIMEOUT_MS` | 3000 | HTTP client negotiate |
| `HUB_RETRY_BASE_MS` / `MAX` | 1000 / 60000 | Hub backoff |
| `HUB_SERVER_UNAVAILABLE_RETRY_MS` | 30000 | API-down quiet retry |
| `HUB_STALL_RECOVERY_MS` | 90000 | Hub reconnect nudge |
| `LAN_ARP_WARM_MAX_MS` | 5000 | Non-blocking ARP warm |
| `HUB_TRANSPORT_FAILURE_RECOVERY_COUNT` | 6 | Before **Wi‑Fi** refresh (non-LAN API only) |
| `HUB_TRANSPORT_FAILURE_REBOOT_COUNT` | 12 | Last-resort device reboot |

**Removed / forbidden constants:**

- `CONFIG_HTTP_MAX_DEFER_MS` tied to hub connect (120 s hub-first window)
- Any HTTP “repair” or hub-triggered defer reset

---

## 7. Error classification

Hub and Wi‑Fi code must classify failures before acting.

| Symptom | Layer | Action |
|---------|-------|--------|
| `WL_DISCONNECTED`, connect timeout | Wi‑Fi | STA retry; hub idle |
| Wrong SSID / 5 failures | Wi‑Fi | Clear creds → Setup AP |
| HTTP negotiate status **-1** (connection refused) | Application | `serverUnavailable_`, 30 s quiet probe |
| HTTP negotiate timeout / DNS / no route | Application | Backoff; ARP warm if API IP on LAN; **no Wi‑Fi refresh** if ARP resolved |
| ARP unresolved to API host | Link / LAN | Non-blocking ARP warm; poke gateway |
| WebSocket drop while API up | Application | Reconnect hub with backoff |
| 6+ transport failures, API **not** on LAN | Transport | `refreshAssociation()` once per episode |
| 6+ transport failures, API on LAN, port closed | Application | `serverUnavailable_` — **not** Wi‑Fi refresh |

**`isApiHostOnLan` definition (implementation):** Parsed API host IP has **resolved ARP** on STA netif — meaning the LAN path to the host exists; port open/closed is application layer.

---

## 8. Serial log contract (verification)

Use serial (115200) to verify behaviour in smoke tests.

### Healthy Phase B boot (API up)

```text
[MODE] RUNNING (NVS credentials)
[WIFI] connected IP=... gateway=... RSSI=...
[HTTP] Config UI: http://<ip>/
[TIME] SNTP sync started
[HTTP] server started on port 80          ← once only
[TIME] synced UTC ...
[HUB] negotiate http://...:5031/hubs/hardware/negotiate?negotiateVersion=1
[HUB] websocket connected
```

Browser: `[HTTP] GET / from <client-ip>`

### Phase C (API down, Wi‑Fi up)

```text
[HUB] negotiate failed status=-1 (connection refused)
[HUB] server unavailable — Wi-Fi kept up (status=-1)
```

**Must not appear:**

```text
[HTTP] server stopped ...
[WIFI] refresh association (transport recovery)   ← while API down on LAN
```

### Phase A (Setup AP)

```text
[MODE] PROVISIONING ...
[WIFI] ---- setup AP credentials ----
[WIFI] SSID: SomNetSetup-XXXX
[HTTP] Config UI: http://192.168.4.1/
[HTTP] server started on port 80
```

---

## 9. Forbidden behaviours (regression list)

Do **not** reintroduce these patterns (root cause of 2026-09-08 instability):

| ID | Forbidden | Why |
|----|-----------|-----|
| **NET-F1** | `repairAfterHubTcp()` / HTTP `end()` + `begin()` after hub TCP | Kills AsyncWebServer; false “started” logs |
| **NET-F2** | Hub failure → `refreshAssociation()` when API host on LAN | Drops `.172` while Wi‑Fi was fine |
| **NET-F3** | HTTP start gated on `isHubConnected()` or 120 s hub-first defer | No config UI during outage / long wait |
| **NET-F4** | Full negotiate every loop while `serverUnavailable_` | Blocks HTTP; use quiet probe only |
| **NET-F5** | Misleading log “server stopped (Wi‑Fi down)” when STA up | Hides real bugs |
| **NET-F6** | `signalRClient.poll()` before `configWebServer.poll()` | Reduces HTTP scheduling fairness |

---

## 10. Implementation plan

Execute as **one refactor pass** against this spec — not incremental patches on 0.11.8–0.11.15 experimental branches.

| Step | Task | Files |
|------|------|-------|
| **I1** | Align `config.h` constants to §6 | `include/config.h` |
| **I2** | HTTP: settle-only start; remove hub gate; single static server | `config_web_server.*` |
| **I3** | Wi‑Fi: document/limit `refreshAssociation()` callers | `wifi_manager.*`, `signalr_client.*` |
| **I4** | Hub: `serverUnavailable_` + quiet probe; error table §7; no HTTP coupling | `signalr_client.*` |
| **I5** | Main: loop order NET-D7; boot paths NET-D1 | `main.cpp` |
| **I6** | Bump firmware version (e.g. `0.12.0-network`) | `platformio.ini` |
| **I7** | Sync [Hardware User Guide](./Hardware-User-Guide.md) SSID to `SomNetSetup-XXXX` | docs |
| **I8** | Run smoke tests §11; check boxes in Phase 11 checklist network prerequisites | checklists |

**Definition of done:** All smoke tests pass on bench hardware (`esp32-84CCA85C36B4` or equivalent); no NET-F* logs during Phase C test.

---

## 11. Smoke test plan

| # | Scenario | Pass criteria |
|---|----------|---------------|
| **S1** | Factory / cred reset → Setup AP | Join `SomNetSetup-XXXX`, `http://192.168.4.1/ping` → `ok` |
| **S2** | Save config → reboot | STA join; `[HTTP] server started` once within 5 s of Wi‑Fi up |
| **S3** | Browse LAN IP | `[HTTP] GET /` in serial; status page loads |
| **S4** | API running | Hub paired within 120 s; `[HUB] websocket connected` |
| **S5** | Stop API | `.172` still responds; `[HUB] server unavailable`; **no** Wi‑Fi refresh; **no** HTTP stop |
| **S6** | Start API | Hub reconnects within 120 s without manual reboot |
| **S7** | Wi‑Fi AP reboot (router) | Device reconnects STA; HTTP serves; hub reconnects |
| **S8** | Change server URL via `/config` | Save, reboot, hub targets new URL |

---

## 12. Relationship to Phase 11

Phase 11 (`automatic-update`) depends on a **stable hub connection** and responsive device loop. Implement **this network spec first**, sign off smoke tests **S1–S8**, then resume Phase 11 feature work.

---

## 13. Lessons learned (2026-09-08)

Documented for future reviewers:

1. **Single-threaded blocking** made synchronous hub negotiate and HTTP UI mutually antagonistic when HTTP was stop/started or deferred behind hub.
2. **Application-down** (API stopped) was treated as **link-down** (Wi‑Fi refresh), breaking the operator’s LAN config path.
3. **Setup AP** is the correct provisioning path; STA LAN UI is the correct running path — both are architecture, not alternatives chosen at random.
4. Serial **`[HTTP] GET`** lines are the ground truth for UI reachability — “server started” alone is insufficient.

---

## 14. Revision history

| Date | Change |
|------|--------|
| 2026-09-09 | Initial spec — NET-D1–D7, phases A–D, implementation plan, smoke tests |
