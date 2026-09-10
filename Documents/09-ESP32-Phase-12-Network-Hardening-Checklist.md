# Phase 12 — Network hardening (post–`0.12.0-network`)

**Status:** **Planning** (2026-09-10) — decisions locked in this doc before firmware work.

| Related | Link |
|---------|------|
| Parent plan | [09-ESP32-Device-Plan.md](./09-ESP32-Device-Plan.md) |
| Network spec (baseline) | [09-ESP32-Network-Spec.md](./09-ESP32-Network-Spec.md) — NET-D1–D7, **`0.12.0-network`** |
| Prior sign-off | [Phase 11 checklist](./09-ESP32-Phase-11-Checklist.md) — **`0.12.2-phase11`** |
| Target firmware | **`0.13.0-network`** (proposed) |

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
| **P12-D1** | **Primary strategy** | 12A non-blocking FSM only / 12B hub FreeRTOS task / 12A then 12B | ☐ **12A first** — non-blocking negotiate + probes; 12B only if smokes fail | |
| **P12-D2** | **Blocking budget in `loop()`** | 0 ms / 5 ms / 20 ms hub work per tick | ☐ **≤ 5 ms** blocking network I/O per `loop()` iteration (measure in dev) | |
| **P12-D3** | **Negotiate during active session** | Always / defer until gap / defer until session idle | ☐ **Defer full negotiate** during active relay session; keep WS read pump | |
| **P12-D4** | **HTTP wedge recovery** | None / rebind on link-up / periodic health ping | ☐ **Rebind** AsyncWebServer if STA up + no GET within N s of `started_` | |
| **P12-D5** | **Quiet probe** | Keep 1.5 s blocking / non-blocking connect FSM | ☐ **Non-blocking** TCP connect FSM (same pattern as negotiate) | |
| **P12-D6** | **Firmware version** | `0.13.0-network` / other | ☐ **`0.13.0-network`** | |
| **P12-D7** | **Regression scope** | Network only / network + Phase 11 spot check | ☐ Network smokes + **one** automatic-update smoke (B1 cadence) | |

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
| A1 | Extract `NegotiateConnectionToken` into multi-tick FSM (no `http.POST` blocking entire poll) | `signalr_client.*` |
| A2 | Extract `probeTcpHostQuiet` into non-blocking connect FSM (≤5 ms per tick) | `signalr_client.*` |
| A3 | Enforce **hub work budget** in `SignalRClient::poll()` — return early to let HTTP/relay run | `signalr_client.*` |
| A4 | **P12-D3** — skip entering Negotiate while `execution_context` busy; queue reconnect after safe point | `signalr_client.*`, `execution_context.*` |
| A5 | **HTTP health (P12-D4)** — if `[HTTP] server started` but no handler activity within e.g. 10 s while STA up, log + `configWebServer.rebind()` (no `end()` storm — single controlled restart) | `config_web_server.*` |
| A6 | Serial contract: `[HUB] negotiate tick`, `[HTTP] health rebind` for smokes | logging |
| A7 | Bump **`0.13.0-network`** | `platformio.ini` |

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
| **S1–S8** | From [Network Spec §11](./09-ESP32-Network-Spec.md#11-smoke-test-plan) | All pass (S1–S2, S7–S8 previously optional — **required** for Phase 12 sign-off) |
| **S9** | Flash **`0.13.0-network`** while API **down**; within 5 s of `[HTTP] server started`, GET `http://<ip>/ping` from PC | `[HTTP] GET` in serial; `ok` response |
| **S10** | Boot race: API **up** but start ESP32 **after** API; hub connects ≤120 s; HTTP GET works throughout | No wedge; Phase 11 `automatic-start` ack success |
| **S11** | Mid-session hub drop (stop API 30 s, restart) during automatic Periodic 10 strokes | Session continues or cleanly reconnects; abort still <15 s; no relay stuck |
| **S12** | Relay jitter regression | 201 ms commanded stroke — `actualStrokeMs` within prior calibration band |

---

## 6. Verification checklist

### 6.1 Phase 12A — non-blocking hub

- [ ] Negotiate never blocks `loop()` > P12-D2 budget (serial timing proof)
- [ ] S9 — HTTP reachable when API down at boot
- [ ] S10 — boot race with API up
- [ ] S5/S6 regression — Phase C unchanged (no Wi‑Fi refresh, no HTTP stop)
- [ ] S11 — mid-session API cycle
- [ ] S12 — relay jitter

### 6.2 Phase 12B — hub task (if needed)

- [ ] B1–B4 complete
- [ ] S9–S12 pass on hub-task build
- [ ] RAM/flash within guidelines (`PARTITIONS.md`)

### 6.3 Regression

- [ ] Phase 11 spot check — `automatic-update` at stroke 5 (B1 cadence)
- [ ] Pairing / revoke unchanged
- [ ] Setup AP path (S1) unchanged

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

## 8. Recommended execution order

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
