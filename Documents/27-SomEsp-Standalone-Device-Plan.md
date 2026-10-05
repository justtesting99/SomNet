# SomEsp — standalone ESP32 trial (device-only)

**Status:** **In progress** — Phase 0 scaffold done in **SomNet.Device** (`env:somesp`); Phases 1+ pending.

**Parent design:** [26 — Site operating profiles](./26-ESP32-Local-Offline-Mode-Design.md) **tier 3 / Mode A** (narrowed for trial).

**Product intent:** **Single user**, **no photo/video**, **no cloud**, **no Pi API** — operator uses **phone/tablet/PC browser** on the same Wi‑Fi as the ESP32. Device is **network-unconnected** from SomNet (no SignalR hub, no pairing requirement for operation).

| Related | Link |
|---------|------|
| Architecture (Mode A detail) | [26 §4–7](./26-ESP32-Local-Offline-Mode-Design.md) |
| Wire payloads (reference) | [SomNet.Device/docs/PROTOCOL.md](../SomNet.Device/docs/PROTOCOL.md) §6 |
| Config UI baseline | [09-ESP32-Phase-3-Checklist.md](./09-ESP32-Phase-3-Checklist.md) |
| P16 (cloud only — not used on SomEsp) | [25 — Session accessory](./25-Session-Accessory-In-Progress-Checklist.md) |

---

## 1. Scope boundary

### In scope (SomEsp / `SomNet.Device/` only)

| Item | Detail |
|------|--------|
| **Build profile** | PlatformIO env e.g. **`somesp`** with `SOMNET_STANDALONE=1` |
| **Wi‑Fi** | STA for LAN browser; Soft‑AP provisioning (existing flow, **Wi‑Fi only**) |
| **Operate UI** | `/operate` — manual + automatic controls (vanilla JS, PROGMEM) |
| **Local API** | `/api/local/*` — unlock, commands, status, caps |
| **Execution** | Reuse `ExecutionContext` + mode FSMs; same `payloadJson` as PROTOCOL §6 |
| **Auth** | PIN → Bearer token (`sessionStorage` on client) |
| **Local session** | Arm/disarm (replaces cloud Session in Progress + hub pairing for gating) |
| **History (optional v1.1)** | JSONL on LittleFS — text only, capped |

### Explicitly out of scope (SomEsp trial)

| Item | Reason |
|------|--------|
| **SomNet.API / SomNet.UI** | Not in fork |
| **Pi / go2rtc / snapshots** | No video path |
| **SignalR / PairDevice / cloud `server_url`** | Unconnected product |
| **Multi-Dom, Dom/Sub, operator JWT** | Single user |
| **Button → hub `ReportButtonEvent`** | No hub (drop or serial-only log) |
| **OTA** | Optional later; not required for trial |
| **Family UI parity with React app** | Accept embedded UI; see [26 §0.7](./26-ESP32-Local-Offline-Mode-Design.md) |

### Repo / branch

- Work on **`SomEsp`** GitHub fork; changes confined to **`SomNet.Device/`** (and this doc under `Documents/` if the fork keeps docs).
- **Do not** merge SomEsp standalone into main until trial sign-off (separate product line).

---

## 2. Locked decisions (SomEsp-D*)

| ID | Decision | Choice |
|----|----------|--------|
| **SE-D1** | Standalone compile flag | **`SOMNET_STANDALONE=1`** in `env:somesp` |
| **SE-D2** | Hub / SignalR | **Not started** in standalone build (`signalRClient.poll()` no-op); **no** `server_url` required in NVS |
| **SE-D3** | Provisioning “fully provisioned” | **Wi‑Fi SSID + password only** (ignore empty `server_url`) |
| **SE-D4** | Config `/config` form | **Hide** SomNet server URL field (or show read-only “not used — standalone”) |
| **SE-D5** | Stroke gating | **Unlock + arm** required; **bypass** hub/pairing/accessory fail-safe tied to hub loss |
| **SE-D6** | GPIO32 session accessory | **Assert ON** when armed; **OFF** on disarm/lock; **no** `sessionAccessoryOnTransportLost` in standalone |
| **SE-D7** | Command ingress | **`LocalCommandService`** → shared `CommandHandler` with `CommandSource::Local` |
| **SE-D8** | PIN | NVS key `operate_pin` (or default factory PIN printed once on serial / label — **change on first unlock**) |
| **SE-D9** | HTTP long commands | **Accept + poll** (`POST` returns immediately; client polls `/api/local/status` or command result) |
| **SE-D10** | Firmware version prefix | e.g. **`somesp-0.1.0`** in `env:somesp` |
| **SE-D11** | v1 command set | `stroke`, `burst`, `abort`, `automatic-start`, `automatic-stop`, `automatic-update` |
| **SE-D12** | History | **Defer to v1.1** unless flash budget allows after MVP sign-off |

---

## 3. Architecture (SomEsp)

```
Browser (LAN)
  → GET /operate
  → POST /api/local/unlock { pin }
  → POST /api/local/arm (optional — or arm on unlock)
  → POST /api/local/commands { commandKey, payloadJson }
  → GET  /api/local/status (busy, armed, automatic active, last result)

ESP32 loop()
  → wifiManager.poll()
  → configWebServer.poll()     // /, /config, /operate, /api/local/*
  → executionContext.poll()
  → commandHandler.poll()      // local + (none) cloud
  → (no signalRClient.poll() in SOMNET_STANDALONE)

CommandHandler
  → validateLocal() → handleExecuteCommand()  // same FSM entry as today
```

---

## 4. Implementation phases

### Phase 0 — Scaffold (0.5–1 day)

**Goal:** SomEsp builds and boots without hub.

| Task | Files / notes |
|------|----------------|
| Add **`[env:somesp]`** in `platformio.ini` | `extends = env:dev`; `-D SOMNET_STANDALONE=1`; `FIRMWARE_VERSION=\"somesp-0.1.0\"` |
| **`#ifdef SOMNET_STANDALONE`** in `main.cpp` | Skip `signalRClient.begin/poll`; status LED rule (Wi‑Fi only, not hub) |
| **`nvs_store`** | `isStandaloneProvisioned()` — Wi‑Fi only; `isFullyProvisioned()` calls it when standalone |
| **`config_web_server` / `config_pages`** | Standalone: omit server URL requirement on POST; hide field on GET |
| **`README.md`** (Device) | SomEsp section: build `pio run -e somesp`, no API pairing |
| Serial banner | `Mode: STANDALONE` |

**Exit:** Flash `somesp`; join Wi‑Fi via `/config`; no hub serial spam; `/` status shows standalone.

**Phase 0 checklist (2026-10-05):**

- [x] `[env:somesp]` + `SOMNET_STANDALONE=1`
- [x] `main.cpp` — hub skipped; standalone banner / LED / button policy
- [x] `nvs_store` — Wi‑Fi-only fully provisioned
- [x] `signalr_client` — no-op in standalone
- [x] `config_web_server` / `config_pages` — no server URL; standalone status copy
- [x] `README.md` + `docs/SOMESP-STANDALONE.md`
- [x] `pio run -e somesp` — SUCCESS (~906 KB flash, 46%)

---

### Phase 1 — Local auth + arm (1–2 days)

**Goal:** PIN gate before any command endpoint.

| Task | Files |
|------|--------|
| New `local_auth.h/.cpp` | PIN verify, token mint (random), TTL, Bearer check |
| NVS: `operate_pin` hash or plaintext (trial: plaintext acceptable with doc warning) | `nvs_store.*` |
| Routes | `POST /api/local/unlock`, `POST /api/local/lock` |
| `POST /api/local/arm`, `POST /api/local/disarm` (or fold into lock) | `config_web_server.cpp` |
| Middleware pattern | Reject `/api/local/commands` without valid Bearer |

**Exit:** Wrong PIN → 401; unlock → token; lock → 403 on commands.

**Phase 1 checklist (2026-10-05):**

- [x] `local_operate.*` + `local_api.cpp` — PIN, Bearer TTL, arm/disarm → GPIO32
- [x] NVS `operate_pin` (default **1234**)
- [x] Routes under `/api/local/*`; `commands` stub → 401/403/501
- [x] Wi‑Fi drop clears local session (SE-T8 prep)
- [x] `docs/SOMESP-STANDALONE.md` API table

---

### Phase 2 — Command path + manual UI (2–4 days)

**Goal:** Stroke / burst / abort from browser.

| Task | Files |
|------|--------|
| Refactor **`command_handler`** | `CommandSource { Local, Hub }`; `validateHubCommand` vs `validateLocalCommand` |
| **`local_command_service.cpp`** | Build `ExecuteCommandPayload` (synthetic `correlationId`, empty token/dom/sub) |
| Local bypass accessory gate when armed | `session_accessory` or `local_armed_` flag per SE-D5/D6 |
| **`operate_pages.cpp`** | Manual panel: power, min/max ms, stroke/burst/abort; JS `computeStrokeMs` mirror |
| `GET /operate` | Link from `/` status: “Control panel” |
| **`GET /api/local/caps`** | `maxStrokeMs`, limits |
| **`POST /api/local/commands`** + poll status | `resultJson` for stroke/burst in status buffer |

**Exit:** Phone on LAN → unlock → stroke → relay fires; burst completes; abort works; S12 jitter spot-check.

**Phase 2 checklist (2026-10-05):**

- [x] `fromLocal` + `validateHubCommand` / `validateLocalCommand`
- [x] `local_command_status` + hub-less acks (`local-*` / `automatic-session-complete`)
- [x] `POST /api/local/commands`, `GET /api/local/caps`, extended status
- [x] `GET /operate` manual UI (stroke / burst / abort)

---

### Phase 3 — Automatic UI (2–3 days)

**Goal:** Start / stop / update / abort for all seven modes (field rules in JS).

| Task | Files |
|------|--------|
| Automatic tab on `/operate` | Port minimal rules from SomNet.UI (`automaticFieldRules` logic in JS) |
| Payload builder | Same shape as `buildAutomaticStartPayload` (no `running`) |
| Stop / update | While automatic active; debounce update ~400 ms |
| Status UI | `automaticActive`, disable start when busy |

**Exit:** Periodic program runs; stop returns idle; one mid-session `automatic-update` replans (serial `[AUTO] update applied`).

**Phase 3 checklist (2026-10-05):**

- [x] Automatic tab on `/operate` (7 modes, field rules, bursts flag)
- [x] `automatic-start` / `automatic-stop` / `automatic-update` (400 ms debounce on update)
- [x] Status line + polling (`automaticActive`, disable start when busy)

---

### Phase 4 — Polish + trial hardening (1–2 days)

| Task | Notes |
|------|--------|
| Provisioning AP: **no** open commands without PIN | SE-D8 |
| Factory reset clears PIN | `/config/factory-reset` |
| **`docs/SOMESP.md`** or README | End-user: join Wi‑Fi → `http://<ip>/operate` |
| Button 10 s hold | Unchanged (Wi‑Fi reset) |
| Button single/double click | **No hub** — log only or disabled in standalone |
| Flash/RAM check | `pio run -e somesp` — stay **< 85%** OTA slot |

**Exit:** Trial checklist §6 all pass.

---

### Phase 5 — History (optional v1.1)

| Task | Notes |
|------|--------|
| Partition / LittleFS if needed | See [PARTITIONS.md](../SomNet.Device/docs/PARTITIONS.md) |
| `local_history_store.cpp` | JSONL append on command complete |
| `GET /api/local/history` | Last N sessions |

Only after Phase 4 sign-off.

---

## 5. File map (new / touched)

| Path | Action |
|------|--------|
| `platformio.ini` | Add `env:somesp` |
| `include/config.h` | `#ifdef SOMNET_STANDALONE` helpers |
| `src/main.cpp` | Conditional hub |
| `src/nvs_store.*` | PIN, standalone provisioned |
| `src/command_handler.*` | Local vs hub validation |
| `src/local_auth.*` | **New** |
| `src/local_command_service.*` | **New** |
| `src/operate_pages.*` | **New** (HTML + JS) |
| `src/config_web_server.cpp` | Register routes |
| `src/config_pages.cpp` | Standalone config form |
| `src/session_accessory_controller.cpp` | Standalone arm policy |
| `src/button_input.cpp` / `main.cpp` | Optional: no hub click |
| `README.md` | SomEsp build |
| `docs/SOMESP-STANDALONE.md` | **New** — user + developer |

**Leave unchanged where possible:** `execution_context.*`, mode FSMs, `relay_controller.*`, `power_timing.*`, `automatic_config.*`.

---

## 6. Smoke tests (trial sign-off)

| # | Steps | Pass |
|---|--------|------|
| **SE-T1** | Flash `somesp`; provisioning AP → Wi‑Fi only → reboot STA | HTTP `/` reachable |
| **SE-T2** | No `server_url` in NVS; no SignalR negotiate in serial | Standalone banner |
| **SE-T3** | `/operate` without unlock | No stroke (401/403) |
| **SE-T4** | Unlock + arm; manual stroke | `actualStrokeMs` sane |
| **SE-T5** | Burst 5×; poll until complete | `strokesCompleted` in status |
| **SE-T6** | Automatic start → stop | Idle; summary in status/`resultJson` |
| **SE-T7** | `automatic-update` mid-session | Replan once |
| **SE-T8** | Wi‑Fi drop mid-session | Policy: disarm + accessory OFF (standalone safety) |
| **SE-T9** | 5× stroke 201 ms | Jitter band per Phase 12 S12 |
| **SE-T10** | Factory reset | PIN cleared; provisioning AP |

---

## 7. Risks

| Risk | Mitigation |
|------|------------|
| Flash size (operate JS + automatic) | MVP manual first; monitor `pio run`; trim PROGMEM |
| UI drift vs main SomNet.UI | Document as trial-only; PROTOCOL payloads as contract |
| Dual maintenance SomEsp vs main | Fork-only until merge decision |
| Accessory GPIO semantics | Document SE-D6 for installers |
| `loop()` stall on history | Defer Phase 5; queue writes |

---

## 8. Merge-back policy (future)

If trial succeeds, options for **main** repo:

1. Keep **`env:somesp`** in `SomNet.Device` on main (compile-time product flag), or  
2. Keep SomEsp as long-lived product fork with periodic merges from main **execution** fixes only.

**Do not** merge standalone into main without explicit product decision (LO-D15 family UI).

---

## 9. Document history

| Date | Change |
|------|--------|
| 2026-10-05 | Initial SomEsp standalone trial plan (fork, device-only, no API/Pi) |
