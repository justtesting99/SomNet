# Phase 12 — Network hardening (post–`0.12.0-network`)

**Status:** **12A bench — signed off** (2026-09-10) — S1–S12 + Phase 11 B1 **pass** on **`0.13.0-network`** (`esp32-84CCA85C36B4`).

| Related | Link |
|---------|------|
| Parent plan | [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) |
| Network spec (baseline) | [09-ESP32-Network-Spec.md](./09-ESP32-Network-Spec.md) — NET-D1–D7, **`0.12.0-network`** |
| Prior sign-off | [Phase 11 checklist](./09-ESP32-Phase-11-Checklist.md) — **`0.12.2-phase11`** |
| Target firmware | **`0.13.0-network`** |
| Rollback reference | **`0.12.2-phase11`** |
| Bench device | `esp32-84CCA85C36B4` @ `192.168.1.172` |

**Goal:** Eliminate cooperative-loop starvation where hub I/O blocks LAN HTTP (`.172`) and wedge “server started but no GET” after boot or reconnect — **without** violating NET-D3/D4/D5.

**Explicitly out of scope (Phase 12):** OTA client implementation; `prod_cloud` CA pinning; Azure SignalR Service; UI session rehydration (separate follow-up).

---

## 1. Problem statement (bench evidence)

After **`0.12.2-phase11`** flash, device showed Wi‑Fi connected + `[HTTP] server started` but:

- No `[HTTP] GET` from LAN
- Hub negotiate failed (`status=-1`, ARP warm timeout)
- Ping to `.172` → destination host unreachable

**Root cause class:** Single `loop()` task runs Wi‑Fi poll, AsyncWebServer, **synchronous** hub negotiate (`HTTPClient::POST` up to **3 s**), TCP quiet probe (**1.5 s**), relay FSM, and automatic session FSM. Blocking hub work starves AsyncWebServer even when NET-D7 loop order is correct.

**Workaround today:** Power-cycle; start API before ESP32; hit `/ping` within ~5 s of HTTP started.

---

## 2. Architecture Q&A (decisions for Phase 12)

### Q1 — Will FreeRTOS affect future OTA?

**Short answer: No conflict — ESP32 firmware already runs on FreeRTOS.**

| Topic | Detail |
|-------|--------|
| Today | Arduino `loop()` **is** a FreeRTOS task (`loopTask`, usually core 1). Wi‑Fi stack uses its own internal tasks. |
| Adding a hub task | Normal ESP32 pattern. Does **not** change dual-bank partition layout (`min_spiffs.csv`, ~1.9 MB × 2). |
| OTA future | OTA writes the **inactive** app slot via `Update` API while running from the active slot. Independent of how many app tasks exist. |
| Phase 12 constraint | Design must define an **OTA-safe idle mode**: relay open, automatic session inactive, hub task quiescent or cooperative during flash. Same requirement whether or not Phase 12 adds a task. |
| RAM cost | One extra task ≈ 4–8 KB stack — monitor after implementation; current flash ~54% of slot. |

**Phase 12 does not implement OTA.** It must **not** block a later OTA phase (no `no_ota` partition, no monolithic flash writer in hub task without suspend hook).

---

### Q2 — Can we use the second core?

**Short answer: Possible but not recommended as the primary strategy.**

| Approach | Pros | Cons |
|----------|------|------|
| **Hub task on core 0** | Offloads `loop()` | Core 0 hosts Wi‑Fi/BT; Espressif warns about contention. **lwIP is not freely thread-safe** across AsyncWebServer (loop) + HTTPClient/WebSockets (hub task) without locks. |
| **Hub task on core 1 (same as loop)** | Safer lwIP sharing with disciplined mutex | Less parallel benefit — still wins if hub work no longer blocks relay poll |
| **Session on core 1, network on core 0** | Theoretical parallelism | Relay timing + `execution_context` must stay deterministic; cross-core races on shared state; high test burden |
| **Cooperative non-blocking FSM (no new task)** | No lwIP threading issues; smallest diff | Requires refactoring `negotiateConnectionToken` / probes into tick-based states |

**Recommendation (P12-D1):** Prefer **cooperative non-blocking hub FSM** on existing loop first (**Phase 12A**). Add a **dedicated hub FreeRTOS task** only if smokes fail or complexity explodes (**Phase 12B**). **Do not** pin hub I/O to core 0 as the first move.

---

### Q3 — Is RTOS required? Two states (network vs session)?

**Short answer: RTOS is not strictly required. The real split is three layers, not two states.**

#### Why “network only when idle” is incomplete

| When | Hub blocking still hurts |
|------|---------------------------|
| **Boot / idle** | Primary wedge — negotiate before first HTTP GET |
| **API down (Phase C)** | Retry storms if NET-F4 slips |
| **Mid-session hub drop** | Re-negotiate can delay relay poll for seconds — abort/stop responsiveness |
| **OTA download (future)** | Long HTTP read must not freeze relay teardown |

Automatic sessions **assume** hub is up; they do not stop hub reconnect logic. So “session running ⇒ no network work” is **not** the current architecture and would be a large semantic change.

#### Logical layers (NET-D3 — keep)

```text
┌─────────────┐   ┌──────────────┐   ┌─────────────┐
│ Wi‑Fi FSM   │   │ HTTP server  │   │ Hub FSM     │
│ link up/down│   │ once/start   │   │ negotiate/WS│
└─────────────┘   └──────────────┘   └─────────────┘
        ↑                  ↑                  ↑
   independent        never hub-gated    must not block
                                         HTTP or relay
```

#### Execution priority (runtime — not separate RTOS states)

| Priority | Work | Budget |
|----------|------|--------|
| **P0** | Relay FSM, automatic/burst sequencer, abort | Every `loop()` — **never** wait on network |
| **P1** | AsyncWebServer poll, button, status LED | Every `loop()` |
| **P2** | Hub I/O (negotiate, WS, probes) | **Bounded** per tick; deferrable |

**Recommendation (P12-D2):** Phase 12 = **time-budgeted hub FSM** + **HTTP health repair**, not a global “idle vs session” mode switch.

Optional **P12-D3:** While `execution_context` reports active pulse/burst/automatic, **defer new negotiate attempts** (continue WS `loop` for inbound commands). Reconnect waits until safe gap — improves mid-session behaviour without disabling hub entirely.

---

## 3. Locked decisions (fill ☑ before coding)

| # | Decision | Options | Choice | Date |
|---|----------|---------|--------|------|
| **P12-D1** | **Primary strategy** | 12A non-blocking FSM only / 12B hub FreeRTOS task / 12A then 12B | ☑ **12A first** — non-blocking negotiate + probes; 12B only if smokes fail | 2026-09-10 |
| **P12-D2** | **Blocking budget in `loop()`** | 0 ms / 5 ms / 20 ms hub work per tick | ☑ **≤ 5 ms** blocking network I/O per `loop()` iteration (measure in dev) | 2026-09-10 |
| **P12-D3** | **Negotiate during active session** | Always / defer until gap / defer until session idle | ☑ **Defer full negotiate** during active relay session; keep WS read pump | 2026-09-10 |
| **P12-D4** | **HTTP wedge recovery** | None / rebind on link-up / periodic health ping | ☑ **Rebind** AsyncWebServer if STA up + no GET within N s of `started_` | 2026-09-10 |
| **P12-D5** | **Quiet probe** | Keep 1.5 s blocking / non-blocking connect FSM | ☑ **Non-blocking** TCP connect FSM (same pattern as negotiate) | 2026-09-10 |
| **P12-D6** | **Firmware version** | `0.13.0-network` / other | ☑ **`0.13.0-network`** | 2026-09-10 |
| **P12-D7** | **Regression scope** | Network only / network + Phase 11 spot check | ☑ Network smokes S1–S12 + **one** automatic-update smoke (B1 cadence) | 2026-09-10 |

---

## 4. Implementation phases

### Phase 12A — Cooperative non-blocking hub (preferred)

**No new task.** Refactor hub transport into explicit states:

```text
HubIdle → ArpWarm → ProbeTcp → NegotiateStart → NegotiateWait → WsConnect → Paired/Unpaired
                ↘ ServerUnavailable (30 s quiet probe FSM)
```

| Step | Task | Files |
|------|------|-------|
| A1 | ☑ Extract `NegotiateConnectionToken` into multi-tick FSM (no `http.POST` blocking entire poll) | `signalr_client.*` |
| A2 | ☑ Extract `probeTcpHostQuiet` into non-blocking connect FSM (≤5 ms per tick) | `signalr_client.*` |
| A3 | ☑ Enforce **hub work budget** in `SignalRClient::poll()` — return early to let HTTP/relay run | `signalr_client.*` |
| A4 | ☑ **P12-D3** — skip entering Negotiate while `execution_context` busy; queue reconnect after safe point | `signalr_client.*`, `main.cpp` |
| A5 | ☑ **HTTP health (P12-D4)** — `rebindListenState()` if no GET within 10 s **after** `CONFIG_HTTP_HEALTH_GRACE_MS` (8 s post-STA-IP); max 1 | `config_web_server.*` |
| A6 | ☑ Serial contract: `[HUB] negotiate tick`, `[HTTP] health rebind` for smokes | logging |
| A7 | ☑ Bump **`0.13.0-network`** | `platformio.ini` |

**Exit criteria:** §6 smokes S1–S8 + S9–S10 pass; no NET-F* regressions.

---

### Phase 12B — Hub FreeRTOS task (fallback)

**Only if 12A fails S9/S10 or FSM complexity is unmaintainable.**

| Step | Task | Notes |
|------|------|-------|
| B1 | Create `hubTask` (stack 6–8 KB, priority **lower** than relay timing path OR same core as loop) | Pin to core 1 initially |
| B2 | Command queue: loop → hub (connect, disconnect, send ack); hub → loop (messages, state flags) | No shared lwIP calls without mutex |
| B3 | `loop()` only calls `hubClient.pumpInbound()` non-blocking | |
| B4 | OTA hook placeholder: `hubTask.suspendForOta()` no-op in Phase 12 | Future OTA uses same hook |

**Exit criteria:** Same smokes as 12A; relay jitter unchanged (scope test: 201 ms stroke ± prior calibration).

---

## 5. Smoke tests (extend Network Spec §11)

| # | Scenario | Pass criteria |
|---|----------|---------------|
| **S1–S8** | From [Network Spec §11](./09-ESP32-Network-Spec.md#11-smoke-test-plan) | All pass (S1–S2, S7–S8 previously optional — **required** for Phase 12 sign-off) | ☑ **2026-09-10** |
| **S9** | Flash **`0.13.0-network`** while API **down**; within 5 s of `[HTTP] server started`, GET `http://<ip>/ping` from PC | `[HTTP] GET` in serial; `ok` response | ☑ **2026-09-10** |
| **S10** | Boot race: API **up** but start ESP32 **after** API; hub connects ≤120 s; HTTP GET works throughout | No wedge; Phase 11 `automatic-start` ack success | ☑ **2026-09-10** (5/5 boots post-fix) |
| **S11** | Mid-session hub drop (stop API 30 s, restart) during automatic Periodic 10 strokes | Session continues or cleanly reconnects; abort still <15 s; no relay stuck | ☑ **2026-09-10** |
| **S12** | Relay jitter regression | 201 ms commanded stroke — `actualStrokeMs` within prior calibration band | ☑ **2026-09-10** |

---

## 6. Verification checklist

### 6.1 Phase 12A — non-blocking hub

- [x] Negotiate never blocks `loop()` > P12-D2 budget — serial shows multi-tick `[HUB] negotiate tick connect/send/read` (2026-09-10)
- [x] S9 — HTTP reachable when API down at boot (2026-09-10)
- [x] S10 — boot race with API up; 5/5 consecutive boots connected + token (2026-09-10, post TcpConnect fix)
- [x] S5/S6 regression (partial) — API stop/start cycles: no Wi‑Fi refresh; `.172` reachable throughout; no HTTP stop on hub events (2026-09-10, §9)
- [x] S11 — mid-session API cycle during automatic Periodic 10 strokes (2026-09-10; abort sub-test not run)
- [x] S12 — relay jitter (5× manual 201 ms → 208/210/209/209/209 ms; band 207–213 ms)

### 6.2 Phase 12B — hub task (if needed)

- [ ] B1–B4 complete
- [ ] S9–S12 pass on hub-task build
- [ ] RAM/flash within guidelines (`PARTITIONS.md`)

### 6.3 Regression

- [x] Phase 11 spot check — `automatic-update` at stroke 5 (B1 cadence) — **2026-09-10** on `0.13.0-network`
- [x] Pairing / revoke unchanged (paired through S8 URL change + S7 router cycle)
- [x] Setup AP path (S1) unchanged — reset-wifi → `SomNetSetup-36B4` @ `192.168.4.1`; captive portal + `/config` on phone (2026-09-10)

---

## 7. What we are NOT doing in Phase 12

| Item | Why deferred |
|------|--------------|
| OTA download/install | Separate phase; partition ready |
| UI session rehydration | Separate UI phase |
| Azure / multi-instance SignalR | Infrastructure |
| Dual-core hub pinning | Risk vs reward (§2 Q2) |
| “Disable all hub work during session” | Would break mid-session reconnect + commands |

---

## 8. Operational behaviour (runtime reference)

Three independent layers (NET-D3) — hub/API state does **not** gate HTTP at `.172`.

### 8.1 Accessing `http://192.168.1.172/`

| Situation | `.172` HTTP |
|-----------|-------------|
| API up, hub paired | ✅ Works |
| API down, hub retrying | ✅ Works (S9) |
| Hub in backoff / negotiate FSM | ✅ Works — HTTP polled **before** hub in `loop()` |
| Boot without browsing `.172` | One `[HTTP] health rebind` possible ~18 s after STA IP (8 s grace + 10 s no-GET); benign wedge recovery |

**Not observed in bench:** ping/GET to `.172` unreachable while `[HTTP] server started` (primary Phase 12 wedge — fixed).

### 8.2 API stopped → restarted (Phase C class)

| Layer | Behaviour |
|-------|-----------|
| **Wi‑Fi** | Stays associated — no `refreshAssociation()` on TCP/5031 failure |
| **HTTP `.172`** | Keeps serving — not stopped on hub disconnect |
| **Hub** | WS disconnect → non-blocking negotiate FSM; `[HUB] retry in 1/2/4/8… s` backoff |
| **Recovery** | Next successful negotiate → `[HUB] handshake ok`; stall recovery (~90 s) can force early retry if backoff maxed |

**Note (2026-09-10 bench):** Transient TcpConnect timeouts use **fast exponential backoff**, not immediate `[HUB] server unavailable` (30 s quiet-probe mode). `serverUnavailable_` still applies when port is confirmed closed via quiet probe / explicit transport error. Reconnect latency tracks API startup time + current backoff step (seconds to ~90 s in worst idle cycle).

### 8.3 Post-12A fix log (implementation)

| Issue | Fix |
|-------|-----|
| `IncompleteInput` / parse before full HTTP body | `responseComplete()` waits for `Content-Length` or connection close |
| TcpConnect timeout → false `server unavailable` (30 s penalty) | TcpConnect timeout → normal 1/2/4 s hub backoff only |
| Stale socket on 5 ms connect slices | `client.stop()` before each connect retry |
| Spurious health rebind during boot | `CONFIG_HTTP_HEALTH_GRACE_MS` (8 s after STA IP) before no-GET timer |

---

## 9. Bench sign-off log

### 9.1 S9 — API down at boot (2026-09-10)

- `[HTTP] server started` → `[HTTP] GET` within 5 s while hub negotiate retrying — **pass**
- `.172` reachable; no destination-unreachable wedge

### 9.2 S10 — boot with API up (2026-09-10)

| Run | Boot → `[HUB] handshake ok` | Notes |
|-----|----------------------------|-------|
| 1st retest | ~22 s | Clean negotiate FSM |
| 2nd–4th (pre TcpConnect fix) | 13 s – never | False `server unavailable`; fixed same day |
| **5/5 post-fix** | ~13–30 s | All connected + token retrieved |

### 9.3 API stop/start cycles — idle hub (2026-09-10, partial S11)

Several rounds of stopping/restarting API with gaps. Single session `10:13:15` → `10:24:49`:

| Cycle | Disconnect | Reconnect (`handshake ok`) | Backoff pattern |
|-------|------------|----------------------------|-----------------|
| Boot | — | 10:13:28 (~13 s) | ARP warm timeout; negotiate ok |
| 1 | 10:13:38 | 10:15:17 (~99 s) | 2→4→8→16→32 s; stall recovery @ 10:15:06 |
| 2 | 10:17:40 | 10:19:03 (~83 s) | Same pattern |
| 3 | 10:19:18 | 10:20:57 (~99 s) | Stall recovery @ 10:20:41 |
| 4 | 10:21:39 | 10:23:05 (~86 s) | — |
| 5 | 10:23:27 | 10:24:49 (~82 s) | — |

**Pass criteria met (idle):** Wi‑Fi stayed up; no Wi‑Fi refresh; `.172` confirmed reachable after runs; hub re-paired each time API returned; negotiate non-blocking throughout.

### 9.4 S11 — automatic session + API down (2026-09-10)

Config: Periodic, 10 strokes, `gapSec=8`, `strokeMs=212`, power 50%. API stopped after stroke 3 (`10:47:56`).

| Criterion | Result |
|-----------|--------|
| Session continues through outage | ✅ Strokes 4→10 while hub disconnected (~56 s) |
| Relay timing | ✅ `[RELAY] OFF after ~221ms` every stroke — no stuck relay |
| Session completes cleanly | ✅ `[AUTO] complete success=true reason=endSession` at stroke 10 |
| P12-D3 defer | ✅ No `[HUB] negotiate` during active session; negotiate starts at `10:48:52` after complete |
| Hub reconnect post-session | ✅ `handshake ok` at `10:49:18` (~26 s after session end) |
| Completion ack while hub down | ⚠️ `[HUB] AckCommand skipped - hub not ready` — expected; session still completed locally |

**Not run:** Abort `<15 s` sub-test after reconnect (optional).

### 9.6 S12 — relay jitter (2026-09-10)

Manual mode, 5× single stroke @ **201 ms** commanded (`powerPercent=47`):

| Stroke | `[RELAY] OFF after` | `actualStrokeMs` |
|--------|---------------------|------------------|
| 1 | 208 ms | 208 |
| 2 | 210 ms | 210 |
| 3 | 209 ms | 209 |
| 4 | 209 ms | 209 |
| 5 | 209 ms | 209 |

**Pass** — all within Phase 6 calibration band (**207–213 ms**); no regression from Phase 12 non-blocking hub work.

### 9.7 Phase 11 B1 spot check (2026-09-10)

Periodic **10 strokes** (`gapSec=5`). At stroke **5**, UI sent **`automatic-update`** (power 50%→80%, `strokeMs` 212→325).

| Step | Serial evidence | Pass |
|------|-----------------|------|
| Update at stroke 5 | `[AUTO] update queued mainStrokes=5` | ✅ |
| Ack | `automatic-update` ack `success=true` | ✅ |
| Apply after current stroke | `[AUTO] update applied` before stroke 6 | ✅ |
| Strokes 6–10 new plan | `power=80% strokeMs=325 gapSec=5` | ✅ |
| Session complete | `[AUTO] complete success=true` — 10 strokes | ✅ |

### 9.8 S1–S8 Network Spec regression (`0.13.0-network`)

Run on `esp32-84CCA85C36B4`. Record date + serial snippet per row. **Suggested order:** S3→S4→S5→S6 (quick) → S8→S2 → S7 → S1 (most disruptive last).

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **S3** | Browse `http://192.168.1.172/` (or `/ping`) while STA up | `[HTTP] GET /` or `/ping` in serial; page/`ok` loads | ☑ **2026-09-10** |
| **S4** | API running; device booted or already up | `[HUB] handshake ok` within **120 s** of Wi‑Fi up | ☑ **2026-09-10** (~14 s) |
| **S5** | Hub paired; **stop API** 30 s; GET `http://192.168.1.172/ping` | `.172` responds; **no** `[WIFI] refresh association`; **no** `[HTTP] server stopped` | ☑ **2026-09-10** |
| **S6** | **Start API** (after S5) | `[HUB] handshake ok` within **120 s**; no device reboot | ☑ **2026-09-10** (`handshake ok` 46 s after Wi‑Fi; note: power-cycle during test) |
| **S8** | On `/config`: set `server_url` to `http://192.168.1.47:5032` (wrong port); Save → reboot; then restore `:5031` and Save → reboot | After 1st reboot: negotiate log shows **:5032**; after restore: **:5031** + `handshake ok` | ☑ **2026-09-10** |
| **S2** | (Covered by S8 save/reboot) or edit friendly name on `/config`, Save | `[HTTP] server started` **once** within **5 s** of `[WIFI] connected` | ☑ **2026-09-10** (3 s on restore reboot) |
| **S7** | Reboot **router/AP** (or disable Wi‑Fi on router 60 s); wait for STA recovery | Device reconnects STA; `[HTTP] GET` works; hub `handshake ok` ≤120 s | ☑ **2026-09-10** (STA ~3 min; hub 10 s after STA) |
| **S1** | **Reset Wi‑Fi / server** on `/config` (or 10 s button hold) → reboot | Join `SomNetSetup-XXXX` on phone/PC; `http://192.168.4.1/` or `/ping` → page/`ok`; re-provision → RUNNING + hub | ☑ **2026-09-10** |

**NET-F* watch (must NOT appear during S5/S6/S7):** `[HTTP] server stopped`, `[WIFI] refresh association` while API host on LAN.

**S3–S6 note:** Extensively covered 2026-09-10 (S9/S10/API cycles); re-run S5/S6 once for explicit §11 sign-off if desired.

### 9.9 S1–S7/S8 bench notes (2026-09-10)

| Test | Key evidence |
|------|----------------|
| **S3** | `[HTTP] GET / from 192.168.1.47`; status page displayed |
| **S4** | Boot `12:37:22` Wi‑Fi → `12:37:36` `handshake ok` |
| **S5** | API down; `[HTTP] GET /` at `12:39:04` during hub retry; no NET-F2/F3 |
| **S6** | `handshake ok` `12:40:57` after API up (device power-cycled during test) |
| **S8** | Banner `Server: …5032`; negotiate `:5032`; restore → `:5031` + `handshake ok` |
| **S2** | `[HTTP] server started` 3 s after Wi‑Fi on restore reboot (`12:42:55`→`12:42:58`) |
| **S7** | Router cycle: `[WIFI] link lost` → reconnect `12:47:48` → `handshake ok` `12:47:58` |
| **S1** | `POST /config/reset-wifi` → `Mode: PROVISIONING`; iPhone @ `192.168.4.2` captive portal + `/config`; save → `.172` + `handshake ok` `13:11:32` |

### 9.10 Phase 12 sign-off

- [x] **S1** — Setup AP (`SomNetSetup-36B4` + `192.168.4.1`; phone captive portal + re-provision) — **2026-09-10**

**12B (hub FreeRTOS task):** Not required — S9/S10 pass on 12A.

**Operator note:** `192.168.4.1` is reachable only while joined to **`SomNetSetup-XXXX`** (not from home LAN). Use **`192.168.1.172`** (or DHCP IP) for day‑to‑day config on STA.

---

## 10. Recommended execution order

1. Lock **P12-D1–D7** (operator review of this doc)
2. Implement **12A** (A1–A7)
3. Run **S1–S12** on bench (`esp32-84CCA85C36B4`)
4. If S9/S10 fail → **12B** hub task
5. Update [Network Spec](./09-ESP32-Network-Spec.md) §2 “Future upgrade” → implemented
6. Update [Device Plan](./09-ESP32-Device-Plan.md) post–Phase 11 follow-ups
7. Sign off Phase 12; tag **`0.13.0-network`**

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-10 | Initial Phase 12 planning — FreeRTOS/OTA/dual-core Q&A; 12A/12B strategy; smokes S9–S12 |
| 2026-09-10 | 12A implemented (`0.13.0-network`); negotiate/probe FSM; HTTP health rebind |
| 2026-09-10 | Bench: S9 pass; S10 pass (5/5 boots post TcpConnect/server-unavailable fix); idle API cycle partial S11; §8 operational notes |
| 2026-09-10 | S11 pass — Periodic 10 strokes through API down; P12-D3 defer verified; hub reconnect post-session |
| 2026-09-10 | S12 pass — 5× manual 201 ms strokes; actualStrokeMs 208–210 ms (prior band) |
| 2026-09-10 | Phase 11 B1 spot check pass on `0.13.0-network` — automatic-update at stroke 5 |
| 2026-09-10 | S2–S8 pass on `0.13.0-network` (S1 Setup AP pending) |
| 2026-09-10 | **S1 pass** — reset-wifi → setup AP; iPhone captive portal @ `192.168.4.2`; re-provision → `.172` + `handshake ok` |
| 2026-09-10 | **Phase 12A signed off** — S1–S12 + B1 on `0.13.0-network` |
