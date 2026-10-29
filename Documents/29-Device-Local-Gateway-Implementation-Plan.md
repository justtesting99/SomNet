# Device local gateway — implementation plan & checklists

**Status:** **Phase 7 in progress** — Phase 6 exit met (TheSystem admin test bed + hardware). **P7-D1** stop endpoint shipped.

**Deploy:** **Docker deferred** — laptop `dotnet run` for gateway + ESP on LAN until Linux compose is needed (Phase 5 artifacts remain in repo).

**Audience:** Gateway + client **host in TheSystem** (`TheSystem.sln`); firmware, **`SomNet.Shared`**, and SomNet product app remain in the **SomNet** repo. Laptop dev: TheSystem + gateway startup projects; **Docker compose deferred** (Phase 5 Dockerfile lives under `TheSystem/SomNet.Device.LocalGateway/`).

| Related | Link |
|---------|------|
| Integration guide (use case, job flow) | [28 — Scheduled jobs — local device integration](./28-Scheduled-Jobs-Local-Device-Integration.md) |
| TheSystem / admin test runbook | [SomNet integration runbook](./SomNetIntegrationRunbook.md) |
| SomEsp firmware & local API | [SomNet.Device/docs/SOMESP-STANDALONE.md](../SomNet.Device/docs/SOMESP-STANDALONE.md) |
| Wire payloads | [SomNet.Device/docs/PROTOCOL.md](../SomNet.Device/docs/PROTOCOL.md) §6.5–6.7 |
| SomNet history text (reference) | [07 — Session & History](./07-Session-And-History.md) § Automatic session summaries |
| UI summary algorithm (reference) | `SomNet.UI/src/utils/sessionSummary.ts` · API: `SessionActionSnapshotSummaryBuilder.cs` |

---

## 1. Goal

Deliver two artifacts:

| Artifact | Type | Role |
|----------|------|------|
| **`SomNet.Device.LocalClient`** | `net9.0` class library | HTTP client for ESP `/api/local/*`; job runner; parses `resultJson` |
| **`SomNet.Device.LocalGateway`** | `net9.0` ASP.NET Core host | **Small API** the main app calls (same machine or Docker network); wraps `LocalClient` |

**Out of scope (v1):** SomNet.API, SignalR, SQL Server, video, SomNet.UI, hub pairing, multi-tenant Dom/Sub.

**In scope (v1):** One configured ESP (base URL + PIN); **automatic-start** with wait-for-completion; structured **job result** + **SomNet-style summary string** + **raw `resultJson`** for the main app’s own history DB.

---

## 2. Architecture

```text
┌──────────────────────────────────────┐
│  Main application                    │
│  (laptop dev → later Docker compose) │
│  Scheduler → HTTP + SomNet.Shared    │
└──────────────────┬───────────────────┘
                   │  localhost / compose network (API key)
                   ▼
┌──────────────────────────────────────┐
│  SomNet.Device.LocalGateway :5290    │
│  POST /api/v1/automatic/run          │
└──────────────────┬───────────────────┘
                   │  Wi‑Fi LAN (PIN → Bearer)
                   ▼
┌──────────────────────────────────────┐
│  ESP32 somesp — /api/local/*         │
└──────────────────────────────────────┘
```

**Dev:** main app and gateway run on the **same laptop** (e.g. gateway `http://localhost:5290`).  
**Deploy:** both services in the **main app’s Docker compose** on the Linux box; gateway still uses **`Device:BaseUrl`** = ESP LAN IP (see Phase 5).

---

## 3. Locked decisions (v1)

| ID | Decision | Choice |
|----|----------|--------|
| **LG-D1** | ESP firmware | **`env:somesp`**; hub **paused** during unattended runs |
| **LG-D2** | Control path | ESP **local API** only (`unlock` → `arm` → `commands`) |
| **LG-D3** | Gateway auth | Shared secret header **`X-SomNet-Device-Gateway-Key`** (same pattern as Edge Agent) |
| **LG-D4** | Run semantics | **Synchronous** HTTP: request blocks until session ends, **timeout**, or **cancel** (client disconnect) |
| **LG-D5** | History | Gateway returns **`summary`** (SomNet-style) + **`result`** (raw); **main app persists** both |
| **LG-D6** | JSON enums | `SomNetJsonOptions` on serialize/deserialize (parity with UI/API) |
| **LG-D7** | Default port | **`5290`** (avoid 5031 SomNet.API, 5190 Edge.Agent) |
| **LG-D8** | Device config | v1: **single device** in `appsettings` (`Device:BaseUrl`, `Device:Pin`); multi-device → v2 |

### Pre–Phase 0 decisions (signed off 2026-10-25)

| ID | Question | Decision |
|----|----------|----------|
| **LG-P0-1** | Where is code built first? | **Done (2026-10-25):** `SomNet.Device.LocalClient`, `SomNet.Device.LocalGateway`, and both test projects live in **TheSystem**; **`SomNet.Shared`** stays in SomNet (project reference to sibling repo). |
| **LG-P0-2** | Hosting path | **Laptop:** main app + gateway local processes. **Production:** both in **same compose** as main app on Linux. |
| **LG-P0-3** | After successful run | **`disarmAfterRun: true`** (default); **`lockAfterRun: false`** unless policy changes. |
| **LG-P0-4** | Human `/operate` vs scheduler | **Single operator** — concurrent browser use acceptable; gateway **409** only for overlapping **gateway** runs. |
| **LG-P0-5** | Run request body | **Full automatic parameters** each POST; **presets live only** in main app DB (not gateway). |
| **LG-P0-6** | Main app contracts | Main app references **`SomNet.Shared`** (project ref while in monorepo; DLL/package after move) for DTOs + summary types. |

**Migration note (LG-P0-1):** **Complete.** Projects removed from `SomNet.slnx`; TheSystem references `..\SomNet\SomNet.Shared`. Gateway **never** needs `SomNet.API`. Layout: [TheSystem `SOMNET_GATEWAY_SOLUTION_LAYOUT.md`](../../TheSystem/Docs/SOMNET_GATEWAY_SOLUTION_LAYOUT.md).

---

## 4. HTTP contract (gateway → main app)

### 4.1 `GET /health`

- **200** `{ "status": "ok" }`
- No auth (or optional — team choice in Phase 4).

### 4.2 `GET /api/v1/device/status`

- Auth required.
- Proxies ESP `GET /api/local/status` + `GET /api/status` (wifi) into one DTO for preflight checks.

### 4.3 `POST /api/v1/automatic/run`

**Request body:**

```json
{
  "parameters": { /* AutomaticControlStateDto shape, camelCase, no "running" */ },
  "waitTimeoutSeconds": 7200,
  "disarmAfterRun": true,
  "lockAfterRun": false
}
```

Defaults when omitted: **`disarmAfterRun: true`**, **`lockAfterRun: false`** (per **LG-P0-3**).

**Response 200** (`AutomaticRunResponseDto`):

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `Completed`, `FailedPrecondition`, `FailedStart`, `TimedOut`, `Cancelled`, `DeviceUnreachable` |
| `message` | string | Scheduler-friendly one line |
| `summary` | string? | SomNet-style history line when `result` present |
| `result` | object? | Parsed automatic-stop `resultJson` |
| `startedAtUtc` | datetime? | Host UTC when run accepted |
| `endedAtUtc` | datetime? | Host UTC when run finished |
| `deviceCorrelationId` | string? | ESP `local-…` id |

**Response 409** — device busy / `automaticActive` (policy: reject without start).

**Response 502/503** — ESP unreachable or local API error.

### 4.4 `POST /api/v1/automatic/stop` (optional v1.1)

- Bearer session on gateway only; sends ESP `automatic-stop` if a run is in progress (internal lock).

---

## 5. Library surface (`SomNet.Device.LocalClient`)

| Type | Members |
|------|---------|
| `SomEspLocalClientOptions` | `BaseUrl`, `Pin`, `PollIntervalMs`, `HttpTimeout` |
| `SomEspLocalClient` | `UnlockAsync`, `ArmAsync`, `DisarmAsync`, `LockAsync`, `GetLocalStatusAsync`, `GetDeviceStatusAsync`, `SendCommandAsync` |
| `LocalStatusDto` | Maps ESP status JSON (`automaticActive`, `busy`, `resultJson`, …) |
| `AutomaticDeviceJobRunner` | `RunAutomaticAsync(parameters, waitTimeout, disarmAfter, ct)` → `AutomaticDeviceJobResult` |
| `AutomaticDeviceJobResult` | As [doc 28](./28-Scheduled-Jobs-Local-Device-Integration.md) §4.3 |

---

## 6. Shared summary (`SomNet.Shared`)

Move or duplicate **automatic session summary** into shared code so gateway and future clients match UI/API:

| Source today | Target |
|--------------|--------|
| `SessionActionSnapshotSummaryBuilder.BuildForAutomaticSessionComplete` | `AutomaticSessionSummaryBuilder.BuildFromResultJson(string? resultJson, string? fallbackReason)` in **SomNet.Shared** |
| `AutomaticResultJson` shape | `AutomaticSessionResultDto` in **SomNet.Shared** (optional; or deserialize with `JsonDocument`) |

**Check:** Golden tests copied from `automaticResultJson.test.ts` / API tests — same strings as UI.

---

## 7. Phases & checklists

### Phase 0 — Scaffold & solution

**Goal:** Empty projects compile; CI-friendly layout.

- [x] **P0-D1** Create `SomNet.Device.LocalClient/SomNet.Device.LocalClient.csproj` (`net9.0`, ref `SomNet.Shared`)
- [x] **P0-D2** Create `SomNet.Device.LocalGateway/SomNet.Device.LocalGateway.csproj` (`Microsoft.NET.Sdk.Web`, ref LocalClient)
- [x] **P0-D3** Add both projects to `SomNet.API/SomNet.slnx`
- [x] **P0-D4** `LocalGateway` `appsettings.json`: `Gateway:ApiKey`, `Device:BaseUrl`, `Device:Pin`, `Kestrel:Endpoints` → port **5290**
- [x] **P0-D5** `Properties/launchSettings.json` for local dev
- [x] **P0-D6** Link this plan from [doc 28](./28-Scheduled-Jobs-Local-Device-Integration.md) §8 (replace “planned” with link)
- [x] **P0-D7** **LG-P0-1:** Host `LocalClient`, `LocalGateway`, and test projects in **TheSystem** solution; drop from `SomNet.slnx`; keep **`SomNet.Shared`** in SomNet repo

**Exit:** `dotnet build` hosting solution (TheSystem) succeeds for gateway projects.

---

### Phase 1 — ESP local HTTP client

**Goal:** Typed calls to SomEsp local API without job orchestration.

- [x] **P1-D1** DTOs for unlock response (`token`, `expiresAtMs`), commands accept (`accepted`, `correlationId`), local status
- [x] **P1-D2** `UnlockAsync` / `LockAsync` / `ArmAsync` / `DisarmAsync` with `Authorization: Bearer`
- [x] **P1-D3** `SendCommandAsync(commandKey, payloadJson)` — POST `/api/local/commands`
- [x] **P1-D4** `GetLocalStatusAsync` — parse `resultJson` string when present
- [x] **P1-D5** `GetDeviceStatusAsync` — `GET /api/status` (wifi, standalone, hubEnabled)
- [x] **P1-D6** Central `SomEspLocalApiException` with HTTP status + device error code (`invalid_pin`, `not_armed`, …)
- [x] **P1-D7** Unit tests with `HttpMessageHandler` mock (`SomNet.Device.LocalClient.Tests`)

**Smoke (manual):**

| # | Steps | Pass |
|---|--------|------|
| **P1-T1** | Call `UnlockAsync` + `ArmAsync` against bench ESP | 200, token non-empty |
| **P1-T2** | `SendCommandAsync("automatic-start", …)` minimal payload | `accepted: true` |

**Exit:** P1-T1–T2 on real somesp device.

---

### Phase 2 — Automatic job runner

**Goal:** End-to-end automatic session with completion result.

- [x] **P2-D1** `AutomaticDeviceJobRunner` — precondition check (`busy`, `automaticActive`)
- [x] **P2-D2** Serialize `AutomaticControlStateDto` → start payload (omit `Running`)
- [x] **P2-D3** Poll until `!automaticActive && !busy` or timeout
- [x] **P2-D4** Do not treat start ack as session end (`automaticActive` still true)
- [x] **P2-D5** On complete: parse `resultJson` → `AutomaticSessionResultDto`
- [x] **P2-D6** Map to `AutomaticDeviceJobResult` + `message` templates
- [x] **P2-D7** Optional `disarmAfterRun` / `lockAfterRun`
- [x] **P2-D8** CancellationToken → optional `automatic-stop` + `Cancelled` status
- [x] **P2-D9** Unit tests: poll state machine with mocked status sequence

**Smoke:**

| # | Steps | Pass |
|---|--------|------|
| **P2-T1** | Run with `endSessionMode: strokes`, `endSessionValue: 3` | `Completed`, `result.strokesCompleted >= 1` |
| **P2-T2** | Run while `automaticActive` | `FailedPrecondition` without second start |
| **P2-T3** | `waitTimeout` 5s on long program | `TimedOut` |

**Exit:** P2-T1–T3.

---

### Phase 3 — SomNet-style summary (Shared)

**Goal:** Same history line text as SomNet UI/API from raw `resultJson`.

- [x] **P3-D1** Add `AutomaticSessionSummaryBuilder` to `SomNet.Shared`
- [x] **P3-D2** Port logic from `SessionActionSnapshotSummaryBuilder.BuildForAutomaticSessionComplete`
- [x] **P3-D3** Refactor API `SessionActionSnapshotSummaryBuilder` to call Shared (thin wrapper) — avoid drift
- [x] **P3-D4** Golden cases in `SomNet.Device.LocalClient.Tests` (+ API test duration fix)
- [x] **P3-D5** Runner sets `Summary` + `Message` from `AutomaticSessionSummaryBuilder.BuildFromResultJson(...)`

**Exit:** Golden strings match `sessionSummary.test.ts` / existing API expectations.

---

### Phase 4 — Local gateway HTTP host

**Goal:** Main app calls gateway only.

- [x] **P4-D1** `GatewayApiKeyMiddleware` — `X-SomNet-Device-Gateway-Key`
- [x] **P4-D2** Register `SomEspLocalClient` + `AutomaticDeviceJobRunner` DI (singleton or scoped per device)
- [x] **P4-D3** `GET /health`, `GET /api/v1/device/status`
- [x] **P4-D4** `POST /api/v1/automatic/run` — body validation (`parameters` required)
- [x] **P4-D5** Single-flight lock — reject concurrent `/automatic/run` with **409**
- [x] **P4-D6** OpenAPI/Swagger optional in Development only
- [x] **P4-D7** Structured logging (correlation id per request, device correlation id in logs)
- [x] **P4-D8** `AutomaticRunResponseDto` in `SomNet.Shared` (gateway + main app reference)

**Smoke:**

| # | Steps | Pass |
|---|--------|------|
| **P4-T1** | `curl` health + status with API key | ✓ 2026-10-25 (laptop) |
| **P4-T2** | POST `/automatic/run` short session | ✓ 2026-10-25 |
| **P4-T3** | Missing API key | ✓ 2026-10-25 |
| **P4-T4** | Two parallel POSTs | Second **409** — optional manual; covered by `LocalGatewayWebTests` |

**Exit:** P4-T1–T3 manual + T4 via test (or parallel POST smoke).

---

### Phase 5 — Docker & LAN networking

**Goal:** Run gateway on Linux Docker alongside main app; reach ESP on Wi‑Fi.

**Deploy status:** **Deferred** — no compose/Linux bench smoke for now; use local gateway on **5290** (P4 smoke complete on laptop).

- [x] **P5-D1** `Dockerfile` for `SomNet.Device.LocalGateway` (multi-stage, `SkipFrontendBuild` N/A)
- [x] **P5-D2** `docker-compose` snippet in doc or `SomNet.Device.LocalGateway/docker-compose.example.yml`
- [x] **P5-D3** Document **host network** or `extra_hosts` / host IP for `Device:BaseUrl` (ESP cannot use `host.docker.internal` on all Linux setups)
- [x] **P5-D4** Secrets: `Device__Pin`, `Gateway__ApiKey` via env (not in image)
- [x] **P5-D5** Healthcheck `GET /health`
- [x] **P5-D6** Main app config: `DeviceGateway:BaseUrl` + API key header

**Smoke:**

| # | Steps | Pass |
|---|--------|------|
| **P5-T1** | Compose up on Linux bench; run from sibling container | *deferred* |
| **P5-T2** | Reboot ESP; next job | `DeviceUnreachable` then recovery after Wi‑Fi up — *deferred* |

**Exit:** P5-T1 when Docker deploy resumes (`docker-compose.example.yml` + `Dockerfile` ready).

---

### Phase 6 — Main application integration

**Goal:** Scheduler uses gateway; persists history locally.

- [x] **P6-D1** Document client snippet (HttpClient + `AutomaticRunResponseDto`) for main app repo — [30-Main-App-Device-Gateway-Integration.md](./30-Main-App-Device-Gateway-Integration.md); `IDeviceGatewayClient` + `AddDeviceGatewayClient()`
- [x] **P6-D2** Job stores: `status`, `message`, `summary`, raw `result` JSON, UTC timestamps, optional job id — `AutomaticRunJobRecordDto` / `AutomaticRunJobRecordBuilder`
- [x] **P6-D3** Scheduler policy: skip if gateway returns 409; backoff on `DeviceUnreachable` — `DeviceGatewaySchedulerPolicy`
- [x] **P6-D4** No dependency on SomNet.API in main app (only `SomNet.Shared` optional for DTOs)

**Exit:** ✓ TheSystem admin UI + gateway + ESP (see [SomNet integration runbook](./SomNetIntegrationRunbook.md)). Scheduler wiring remains in main app when ready.

---

### Phase 7 — Hardening (v1.1, optional)

- [x] **P7-D1** `POST /api/v1/automatic/stop` — `AutomaticStopRequestDto` (`abort` optional); `IDeviceGatewayClient.StopAutomaticAsync`
- [x] **P7-D2** Multi-device: `Device:Devices[]` + `deviceId` route param
- [ ] **P7-D3** mDNS or config service for ESP IP drift — see [§P7-D3](#p7-d3--mdns--esp-ip-drift-not-implemented)
- [x] **P7-D4** Metrics (Prometheus): `GET /api/v1/gateway/metrics` — run status counters, stop/concurrent totals (`GatewayRunMetrics`)
- [x] **P7-D5** Integration test project against recorded ESP JSON fixtures — `SomNet.Device.LocalClient.Tests/Fixtures/` + `EspJsonFixtureTests`

#### P7-D2 — Multi-device (implemented)

**Why:** Several SomEsp units on the same LAN (different rooms, subs, or accessories). The **main app** schedules jobs per logical device; the **gateway** must route each HTTP call to the correct ESP **base URL** and **PIN**, using a stable id that matches firmware and SomNet pairing: **`deviceId`** (e.g. `esp32-84CCA85C36B4` from `GET /api/status`).

**v1 today (LG-D8):** One `Device:BaseUrl` + `Device:Pin` in gateway config. Status JSON already exposes `device.deviceId` for verification. TheSystem can store that id on run records even before P7-D2 ships.

**Config (gateway host):** use `Device:Devices[]`, or legacy flat `Device:BaseUrl` + `Device:Pin` with optional `Device:DeviceId`:

```json
"Device": {
  "Devices": [
    {
      "deviceId": "esp32-84CCA85C36B4",
      "baseUrl": "http://192.168.1.172",
      "pin": "<secret>"
    },
    {
      "deviceId": "esp32-AABBCCDDEEFF",
      "baseUrl": "http://192.168.1.173",
      "pin": "<secret>"
    }
  ],
  "pollIntervalMs": 800
}
```

Environment variables could use indexed keys (`Device__Devices__0__BaseUrl`, …) or a single JSON blob — decide at implementation.

**Target HTTP shape (proposed):** device-scoped routes (plan checklist: **`deviceId` route param**):

| v1 (current) | v2 (P7-D2) |
|--------------|------------|
| `GET /api/v1/device/status` | `GET /api/v1/devices/{deviceId}/status` |
| `POST /api/v1/automatic/run` | `POST /api/v1/devices/{deviceId}/automatic/run` |
| `POST /api/v1/automatic/stop` | `POST /api/v1/devices/{deviceId}/automatic/stop` |

Optional **compatibility:** if exactly one device is configured, allow legacy paths without `{deviceId}` and infer the sole entry.

**Concurrency (important):**

| Scope | Rule |
|-------|------|
| **Per ESP** | At most **one** automatic session (firmware + doc 28 §6). |
| **Gateway v1** | **Global** single-flight — only one `/automatic/run` total across all devices. |
| **Gateway v2** | **Per-`deviceId`** single-flight — device A and device B may run **in parallel** on one gateway process (separate `SomEspLocalClient` or client factory per device, each with its own bearer session). |
| **TheSystem** | Scheduler must pass **`deviceId`** on every run; use app-level locks if multiple workers could target the same device. |

**Library / main app (`IDeviceGatewayClient` v2 sketch):**

- Add `deviceId` to each method, e.g. `RunAutomaticAsync(deviceId, request, …)`, **or** register named clients per device from config.
- **`AutomaticRunJobRecordDto`:** always persist **`deviceId`** (and optional snapshot of `baseUrl` used).
- **Admin UI:** device picker populated from gateway `GET /api/v1/devices` (new list endpoint) or from TheSystem’s own device registry.

**TheSystem data model (prepare now):**

- Store **`deviceId`** on presets, scheduled jobs, and run history — even while only one ESP exists.
- Do **not** key long-term history only by IP; IPs change (see **P7-D3**).

**Hosting:**

- **Default:** one **LocalGateway** instance on the LAN with `Devices[]` — simplest ops.
- **Alternative:** multiple gateway processes each with one device — only if network/policy requires isolation; usually unnecessary at home scale.

**Related:** **P7-D3** (mDNS / discovery) updates **`baseUrl`** when DHCP changes; multi-device makes per-entry IP drift more likely.

**Exit criteria for P7-D2:** Two ESPs on bench; parallel runs on different `deviceId`s succeed; second run on **same** `deviceId` returns **409**; TheSystem admin can select device and run §4.2 preset against each. *(SomNet .NET + gateway tests done; bench verification with two ESPs + TheSystem `deviceId` client calls remain.)*

**Related (different axis):** A second ESP driving an **H-bridge motor** shares the same multi-`deviceId` gateway model but needs **actuator-specific** payloads and firmware — see [31 — Motor actuator early design](./31-Motor-Actuator-Device-Design.md).

#### P7-D3 — mDNS / ESP IP drift (not implemented)

**Problem:** Gateway config stores each ESP as **`baseUrl`** (usually `http://192.168.x.x`). DHCP can assign a **new IP** after reboot or lease expiry. **`deviceId`** stays stable; **`baseUrl`** does not — jobs then fail with `device_unreachable` until someone edits `appsettings` or env vars.

**What P7-D3 is not:** It does not replace **`deviceId`** for scheduling or history. It only keeps **reachability** (URL → current LAN address) correct.

**Typical approaches (pick one at implementation):**

| Approach | Idea | Pros / cons |
|----------|------|-------------|
| **DHCP reservation** | Router pins MAC → IP | Zero code; ops discipline (works today — runbook default) |
| **mDNS hostname** | ESP advertises e.g. `somesp-84cca85c36b4.local`; gateway `baseUrl` uses `http://….local` | Stable URL without static IP; needs mDNS on ESP + resolver on gateway host (Linux often fine; Docker bridge can be fiddly) |
| **Gateway discovery job** | Periodically resolve `deviceId` → IP (mDNS browse, ARP, or `GET /api/status` via last-known IP + subnet scan) and **refresh in-memory `baseUrl`** | Central fix for multi-device; more gateway code; must not fight manual config |
| **External config service** | Small LAN registry UI or file the installer updates | Simple mentally; still manual unless automated |

**Likely v1 implementation sketch:** extend `Device:Devices[]` with optional **`hostName`** (mDNS) **or** keep `baseUrl` but add a **background resolver** that updates the HTTP client factory when the hostname resolves to a new IP. Firmware may need `MDNS_RESPONDER` with a deterministic name derived from `deviceId`.

**Exit criteria:** ESP gets new DHCP address; **without** editing gateway config, the next status/run succeeds after rediscovery (or within one refresh interval). Document Windows vs Linux Docker behavior.

---

## 8. Main application ↔ gateway (reference)

Full guide: **[30 — Main app device gateway integration](./30-Main-App-Device-Gateway-Integration.md)**.

```csharp
builder.Services.AddDeviceGatewayClient();

var deviceId = /* job preset or DeviceGateway:DefaultDeviceId */;
var outcome = await gateway.RunAutomaticAsync(deviceId, new AutomaticRunRequestDto
{
    Parameters = automaticSnapshot,
    WaitTimeoutSeconds = 7200,
    DisarmAfterRun = true,
}, jobCorrelationId, cancellationToken);

var record = outcome.Response is null
    ? /* handle 409 concurrent / unreachable per DeviceGatewaySchedulerPolicy */
    : AutomaticRunJobRecordBuilder.FromGatewayResponse(outcome.Response, jobId, scheduleId, automaticSnapshot);
```

---

## 9. Raw `resultJson` vs SomNet history (clarification)

| Layer | Stores |
|-------|--------|
| **ESP / end of run** | Authoritative **`resultJson`** (`automatic-stop` shape) |
| **SomNet UI/API** | Transforms `resultJson` → **`summary` string**; SQL row holds summary + metadata, not full JSON |
| **This gateway** | Returns **both** `result` and `summary` to the main app |
| **Main app DB** | Should keep **raw `result`** + computed **`summary`** for SomNet-like history views |

---

## 10. Document history

| Date | Change |
|------|--------|
| 2026-10-25 | Initial plan — Phases 0–7, HTTP contract, checklists |
| 2026-10-25 | Pre–Phase 0 decisions LG-P0-1 … LG-P0-6 signed off |
| 2026-10-25 | Phase 5 — Dockerfile, compose example, LAN/env docs |
| 2026-10-25 | Phase 6 — `IDeviceGatewayClient`, job record DTO, doc 30; P5-T1 deferred |
| 2026-10-25 | P7-D1 stop API; P7-D4 metrics; P7-D5 ESP fixtures; runbook §9 |
| 2026-10-25 | P7-D2 multi-device design (plan §7); runbook §9.7 |
| 2026-10-25 | **LG-P0-1 / P0-D7:** Gateway + LocalClient moved to TheSystem solution; Docker Phase 5 still deferred |
