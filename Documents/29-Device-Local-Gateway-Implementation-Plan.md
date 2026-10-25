# Device local gateway — implementation plan & checklists

**Status:** **Phase 0 complete** — phased build for a **lightweight HTTP service** the main application calls; the service drives **SomEsp** over **`/api/local/*`**.

**Audience:** Build first in the **SomNet** repo; **move** `LocalClient` + `LocalGateway` into the **main application solution** for long-term hosting (laptop dev → Docker compose with main app).

| Related | Link |
|---------|------|
| Integration guide (use case, job flow) | [28 — Scheduled jobs — local device integration](./28-Scheduled-Jobs-Local-Device-Integration.md) |
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
| **LG-P0-1** | Where is code built first? | **SomNet repo** (`LocalClient` + `LocalGateway`); **move** projects into the **main application solution** when ready (keep `SomNet.Shared` reference or equivalent package). |
| **LG-P0-2** | Hosting path | **Laptop:** main app + gateway local processes. **Production:** both in **same compose** as main app on Linux. |
| **LG-P0-3** | After successful run | **`disarmAfterRun: true`** (default); **`lockAfterRun: false`** unless policy changes. |
| **LG-P0-4** | Human `/operate` vs scheduler | **Single operator** — concurrent browser use acceptable; gateway **409** only for overlapping **gateway** runs. |
| **LG-P0-5** | Run request body | **Full automatic parameters** each POST; **presets live only** in main app DB (not gateway). |
| **LG-P0-6** | Main app contracts | Main app references **`SomNet.Shared`** (project ref while in monorepo; DLL/package after move) for DTOs + summary types. |

**Migration note (LG-P0-1):** When moving to the main app repo, copy or submodule `SomNet.Device.LocalClient`, `SomNet.Device.LocalGateway`, and retain **`SomNet.Shared`** (project reference, git submodule, or published package). Gateway **never** needs `SomNet.API`.

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

**Exit:** `dotnet build` solution succeeds.

---

### Phase 1 — ESP local HTTP client

**Goal:** Typed calls to SomEsp local API without job orchestration.

- [ ] **P1-D1** DTOs for unlock response (`token`, `expiresAtMs`), commands accept (`accepted`, `correlationId`), local status
- [ ] **P1-D2** `UnlockAsync` / `LockAsync` / `ArmAsync` / `DisarmAsync` with `Authorization: Bearer`
- [ ] **P1-D3** `SendCommandAsync(commandKey, payloadJson)` — POST `/api/local/commands`
- [ ] **P1-D4** `GetLocalStatusAsync` — parse `resultJson` string when present
- [ ] **P1-D5** `GetDeviceStatusAsync` — `GET /api/status` (wifi, standalone, hubEnabled)
- [ ] **P1-D6** Central `SomEspLocalApiException` with HTTP status + device error code (`invalid_pin`, `not_armed`, …)
- [ ] **P1-D7** Unit tests with `HttpMessageHandler` mock (unlock → arm → command sequence)

**Smoke (manual):**

| # | Steps | Pass |
|---|--------|------|
| **P1-T1** | Call `UnlockAsync` + `ArmAsync` against bench ESP | 200, token non-empty |
| **P1-T2** | `SendCommandAsync("automatic-start", …)` minimal payload | `accepted: true` |

**Exit:** P1-T1–T2 on real somesp device.

---

### Phase 2 — Automatic job runner

**Goal:** End-to-end automatic session with completion result.

- [ ] **P2-D1** `AutomaticDeviceJobRunner` — precondition check (`busy`, `automaticActive`)
- [ ] **P2-D2** Serialize `AutomaticControlStateDto` → start payload (omit `Running`)
- [ ] **P2-D3** Poll until `!automaticActive && !busy` or timeout
- [ ] **P2-D4** Do not treat start ack as session end (`automaticActive` still true)
- [ ] **P2-D5** On complete: parse `resultJson` → `AutomaticSessionResultDto`
- [ ] **P2-D6** Map to `AutomaticDeviceJobResult` + `message` templates
- [ ] **P2-D7** Optional `disarmAfterRun` / `lockAfterRun`
- [ ] **P2-D8** CancellationToken → optional `automatic-stop` + `Cancelled` status
- [ ] **P2-D9** Unit tests: poll state machine with mocked status sequence

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

- [ ] **P3-D1** Add `AutomaticSessionSummaryBuilder` to `SomNet.Shared`
- [ ] **P3-D2** Port logic from `SessionActionSnapshotSummaryBuilder.BuildForAutomaticSessionComplete`
- [ ] **P3-D3** Refactor API `SessionActionSnapshotSummaryBuilder` to call Shared (thin wrapper) — avoid drift
- [ ] **P3-D4** `SomNet.Shared.Tests` or extend `SomNet.API.Tests` with golden cases (periodic, bursts on, manualStop, abort)
- [ ] **P3-D5** Runner sets `summary = AutomaticSessionSummaryBuilder.BuildFromResultJson(...)`

**Exit:** Golden strings match `sessionSummary.test.ts` / existing API expectations.

---

### Phase 4 — Local gateway HTTP host

**Goal:** Main app calls gateway only.

- [ ] **P4-D1** `GatewayApiKeyMiddleware` — `X-SomNet-Device-Gateway-Key`
- [ ] **P4-D2** Register `SomEspLocalClient` + `AutomaticDeviceJobRunner` DI (singleton or scoped per device)
- [ ] **P4-D3** `GET /health`, `GET /api/v1/device/status`
- [ ] **P4-D4** `POST /api/v1/automatic/run` — body validation (automaticMode required)
- [ ] **P4-D5** Single-flight lock — reject concurrent `/automatic/run` with **409**
- [ ] **P4-D6** OpenAPI/Swagger optional in Development only
- [ ] **P4-D7** Structured logging (correlation id per request, device correlation id in logs)
- [ ] **P4-D8** `AutomaticRunResponseDto` in `SomNet.Shared` (gateway + main app reference)

**Smoke:**

| # | Steps | Pass |
|---|--------|------|
| **P4-T1** | `curl` health + status with API key | 200 |
| **P4-T2** | POST `/automatic/run` short session | 200, `summary` matches UI pattern |
| **P4-T3** | Missing API key | 401 |
| **P4-T4** | Two parallel POSTs | Second **409** |

**Exit:** P4-T1–T4.

---

### Phase 5 — Docker & LAN networking

**Goal:** Run gateway on Linux Docker alongside main app; reach ESP on Wi‑Fi.

- [ ] **P5-D1** `Dockerfile` for `SomNet.Device.LocalGateway` (multi-stage, `SkipFrontendBuild` N/A)
- [ ] **P5-D2** `docker-compose` snippet in doc or `SomNet.Device.LocalGateway/docker-compose.example.yml`
- [ ] **P5-D3** Document **host network** or `extra_hosts` / host IP for `Device:BaseUrl` (ESP cannot use `host.docker.internal` on all Linux setups)
- [ ] **P5-D4** Secrets: `Device__Pin`, `Gateway__ApiKey` via env (not in image)
- [ ] **P5-D5** Healthcheck `GET /health`
- [ ] **P5-D6** Main app config: `DeviceGateway:BaseUrl` + API key header

**Smoke:**

| # | Steps | Pass |
|---|--------|------|
| **P5-T1** | Compose up on Linux bench; run from sibling container | Automatic run completes |
| **P5-T2** | Reboot ESP; next job | `DeviceUnreachable` then recovery after Wi‑Fi up |

**Exit:** P5-T1.

---

### Phase 6 — Main application integration

**Goal:** Scheduler uses gateway; persists history locally.

- [ ] **P6-D1** Document client snippet (HttpClient + `AutomaticRunResponseDto`) for main app repo
- [ ] **P6-D2** Job stores: `status`, `message`, `summary`, raw `result` JSON, UTC timestamps, optional job id
- [ ] **P6-D3** Scheduler policy: skip if gateway returns 409; backoff on `DeviceUnreachable`
- [ ] **P6-D4** No dependency on SomNet.API in main app (only `SomNet.Shared` optional for DTOs)

**Exit:** One scheduled job runs end-to-end in target Docker environment.

---

### Phase 7 — Hardening (v1.1, optional)

- [ ] **P7-D1** `POST /api/v1/automatic/stop`
- [ ] **P7-D2** Multi-device: `Device:Devices[]` + `deviceId` route param
- [ ] **P7-D3** mDNS or config service for ESP IP drift
- [ ] **P7-D4** Metrics (Prometheus): run count, duration, failures
- [ ] **P7-D5** Integration test project against recorded ESP JSON fixtures

---

## 8. Main application ↔ gateway (reference)

```csharp
// Illustrative — main app (separate repo or project)
var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/automatic/run")
{
    Content = JsonContent.Create(new
    {
        parameters = automaticSnapshot,
        waitTimeoutSeconds = 7200,
        disarmAfterRun = true,
    }),
};
request.Headers.Add("X-SomNet-Device-Gateway-Key", apiKey);

var response = await httpClient.SendAsync(request, cancellationToken);
var body = await response.Content.ReadFromJsonAsync<AutomaticRunResponseDto>();
// Persist body.Summary, body.Result, body.Status for scheduling logic
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
