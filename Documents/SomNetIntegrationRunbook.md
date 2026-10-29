# SomNet device gateway — integration runbook (TheSystem test bed)

**Audience:** Operators and developers wiring **TheSystem** (or any main app) to **`SomNet.Device.LocalGateway`** for **manual admin tests** and later **scheduled jobs**.

**Goal:** Mirror the fields below in a React admin page + server controller so you can run **real hardware** sessions end-to-end without the full TheSystem scheduler.

| Related | Link |
|---------|------|
| Main app integration (DI, policies, persistence) | [30 — Main app device gateway integration](./30-Main-App-Device-Gateway-Integration.md) |
| Gateway plan & smoke | [29 — Device local gateway implementation plan](./29-Device-Local-Gateway-Implementation-Plan.md) |
| ESP wire format | [PROTOCOL.md §6.5–6.7](../SomNet.Device/docs/PROTOCOL.md) |
| Gateway host | [SomNet.Device.LocalGateway/README.md](../../TheSystem/SomNet.Device.LocalGateway/README.md) |

---

## 1. Runtime checklist (laptop)

| Process | Project | Config |
|---------|---------|--------|
| **Main app** | `TheSystem.Server` | `DeviceGateway:BaseUrl`, `DeviceGateway:ApiKey` (e.g. `appsettings.Secrets.json`) |
| **Gateway** | `SomNet.Device.LocalGateway` | `Gateway:ApiKey` (must match main app), `Device:BaseUrl` (ESP LAN URL), **`Device:Pin`** (ESP operate PIN) |
| **Device** | SomEsp `env:somesp` | Wi‑Fi up; hub **disabled** for unattended runs recommended |

**Visual Studio:** one solution, **multiple startup projects** — `SomNet.Device.LocalGateway` + `TheSystem.Server`. No second VS instance required.

**PIN errors:** `PIN is required. Set Device:Pin…` means the **gateway** config is missing `Device:Pin`, not TheSystem.

**Status-only calls** (`GET /api/v1/device/status`) do not need unlock; **run** does.

---

## 2. API surface (main app → gateway)

Register in main app `Program.cs`:

```csharp
builder.Services.AddDeviceGatewayClient();
```

Inject **`IDeviceGatewayClient`** (`SomNet.Device.LocalClient`):

| Method | Gateway route | Purpose |
|--------|---------------|---------|
| `GetDeviceStatusAsync()` | `GET /api/v1/device/status` | Preflight — Wi‑Fi, busy, `automaticActive`, ESP IP |
| `RunAutomaticAsync(request, correlationId?, ct)` | `POST /api/v1/automatic/run` | Unlock → arm → start → **poll until done** (long HTTP) |
| `StopAutomaticAsync(abort, ct)` | `POST /api/v1/automatic/stop` | Cooperative stop or **`abort: true`** while a gateway run is active (**404** if idle) |

**Gateway ops (optional):** `GET /api/v1/gateway/metrics` — Prometheus text counters (runs by status, stop totals, concurrent 409s). Requires API key.

DTOs live in **`SomNet.Shared`** (`SomNet.Shared.DTO.DeviceGateway`, `SomNet.Shared.DTO.Modes`).

Do **not** use `AddSomEspLocalClient()` or `SomEspLocalClient` in the main app — that runs **inside** the gateway process.

---

## 3. HTTP contract

### 3.1 Run request body (`AutomaticRunRequestDto`)

```json
{
  "parameters": { },
  "waitTimeoutSeconds": 7200,
  "disarmAfterRun": true,
  "lockAfterRun": false
}
```

| Field | Notes |
|-------|--------|
| `parameters` | **Required.** Full automatic snapshot — `AutomaticControlStateDto` (§4). |
| `waitTimeoutSeconds` | Host-side poll cap; default **7200** (2 h) if omitted on gateway. |
| `disarmAfterRun` | Default **true** (LG-P0-3). |
| `lockAfterRun` | Default **false**. |

### 3.2 Run response (`AutomaticRunResponseDto`)

Typical success:

```json
{
  "status": "Completed",
  "message": "...",
  "summary": "Periodic — 5 main strokes over … (end session rule)",
  "result": {
    "commandKey": "automatic-stop",
    "automaticMode": "periodic",
    "strokesCompleted": 5,
    "durationMs": 120000,
    "endReason": "endSession"
  },
  "startedAtUtc": "…",
  "endedAtUtc": "…",
  "deviceCorrelationId": "local-…"
}
```

| `status` | Meaning |
|----------|---------|
| `Completed` | Session ended; `summary` / `result` when available |
| `FailedPrecondition` | Busy / already active / unlock failed — often HTTP **409** |
| `FailedStart` | Start rejected |
| `TimedOut` | Host wait exceeded |
| `Cancelled` | Client disconnect |
| `DeviceUnreachable` | ESP/gateway LAN error — often HTTP **502** |

Concurrent gateway run: HTTP **409** with `{ "status": "ConcurrentRun", … }` (not the same as device `FailedPrecondition`).

### 3.3 Stop in-flight run (`POST /api/v1/automatic/stop`)

While a **`/automatic/run`** request is still open on the gateway:

```json
{ "abort": false }
```

| HTTP | `status` | Meaning |
|------|----------|---------|
| **200** | `StopAccepted` | `automatic-stop` (or `abort` if `abort: true`) sent to ESP; original run completes when device is idle |
| **404** | `NoActiveRun` | No gateway run in progress |
| **502** | `DeviceError` | ESP/local API rejected stop |

Main app: **`IDeviceGatewayClient.StopAutomaticAsync(abort)`** — use a **second** HTTP call while the run request is pending (e.g. Stop button).

### 3.4 Status response (`DeviceGatewayCombinedStatusDto`)

Example (idle, ready):

```json
{
  "local": {
    "unlocked": false,
    "armed": false,
    "busy": false,
    "automaticActive": false,
    "wifiConnected": true,
    "commandComplete": false,
    "commandSuccess": false
  },
  "device": {
    "standalone": true,
    "hubEnabled": false,
    "hubConnected": false,
    "hubState": "local",
    "deviceId": "esp32-…",
    "wifiConnected": true,
    "ip": "192.168.1.172",
    "mode": "running"
  }
}
```

---

## 4. `parameters` — automatic snapshot (`AutomaticControlStateDto`)

### 4.1 Rules

- **camelCase** JSON property names (match SomNet UI / API).
- **`automaticMode`** is **required** (camelCase string).
- **Omit `running`** — UI-only; gateway/client strips it before ESP `automatic-start`.
- Set **`endSessionMode`** + **`endSessionValue`** for short admin tests so the device ends the program (don’t rely on `noAutoEnd` for a quick button test).

Shared defaults reference: `ControlStateDefaults.Automatic` in `SomNet.Shared/DTO/Modes/ControlStateDefaults.cs` (default end rule is **`noAutoEnd`** — override for tests).

### 4.2 Recommended admin test preset (short hardware run)

Ends after **5 main strokes**; audible relay; ~minutes not hours.

```json
{
  "automaticMode": "periodic",
  "minimumStrokeMs": 25,
  "maximumStrokeMs": 400,
  "minimumPower": 20,
  "maximumPower": 60,
  "strokeMinSeconds": 5,
  "strokeMaxSeconds": 8,
  "delayBeforeStartSeconds": 0,
  "endSessionMode": "strokes",
  "endSessionValue": 5,
  "burstsOn": false
}
```

Full gateway POST for copy/paste (curl / Postman):

```json
{
  "parameters": {
    "automaticMode": "periodic",
    "minimumStrokeMs": 25,
    "maximumStrokeMs": 400,
    "minimumPower": 20,
    "maximumPower": 60,
    "strokeMinSeconds": 5,
    "strokeMaxSeconds": 8,
    "delayBeforeStartSeconds": 0,
    "endSessionMode": "strokes",
    "endSessionValue": 5,
    "burstsOn": false
  },
  "waitTimeoutSeconds": 7200,
  "disarmAfterRun": true,
  "lockAfterRun": false
}
```

C# (`SomNet.Shared`):

```csharp
var request = new AutomaticRunRequestDto
{
    Parameters = new AutomaticControlStateDto
    {
        AutomaticMode = AutomaticRunMode.Periodic,
        MinimumStrokeMs = 25,
        MaximumStrokeMs = 400,
        MinimumPower = 20,
        MaximumPower = 60,
        StrokeMinSeconds = 5,
        StrokeMaxSeconds = 8,
        DelayBeforeStartSeconds = 0,
        EndSessionMode = EndSessionMode.Strokes,
        EndSessionValue = 5,
        BurstsOn = false,
    },
    WaitTimeoutSeconds = 7200,
    DisarmAfterRun = true,
    LockAfterRun = false,
};
```

### 4.3 PROTOCOL reference example (SomNet UI–aligned)

From [PROTOCOL.md §6.5](../SomNet.Device/docs/PROTOCOL.md) — slightly longer run (**8 strokes**):

```json
{
  "automaticMode": "periodic",
  "minimumStrokeMs": 25,
  "maximumStrokeMs": 400,
  "minimumPower": 0,
  "maximumPower": 80,
  "strokeMinSeconds": 5,
  "strokeMaxSeconds": 5,
  "delayBeforeStartSeconds": 0,
  "endSessionMode": "strokes",
  "endSessionValue": 8,
  "burstsOn": false
}
```

### 4.4 Enum strings (JSON)

**`automaticMode`**

| JSON value | C# `AutomaticRunMode` |
|------------|------------------------|
| `periodic` | `Periodic` |
| `randomPowerOnly` | `RandomPowerOnly` |
| `randomTimingOnly` | `RandomTimingOnly` |
| `randomPowerAndTiming` | `RandomPowerAndTiming` |
| `powerWave` | `PowerWave` |
| `powerAndTimingWave` | `PowerAndTimingWave` |
| `buildUp` | `BuildUp` |

**`endSessionMode`**

| JSON value | C# `EndSessionMode` |
|------------|---------------------|
| `minutes` | `Minutes` |
| `strokes` | `Strokes` |
| `noAutoEnd` | `NoAutoEnd` |

**`burstStyle`** (when `burstsOn: true`)

| JSON value | C# `BurstStyle` |
|------------|-----------------|
| `fixedPowerDelay` | `FixedPowerDelay` |
| `randomPowerOnly` | `RandomPowerOnly` |
| `randomDelayOnly` | `RandomDelayOnly` |
| `randomPowerAndDelay` | `RandomPowerAndDelay` |

### 4.5 Bursts (phase 2 UI)

When **`burstsOn: true`**, send full burst snapshot per PROTOCOL §6.7: `burstPercent`, `burstStyle`, `burstStrokePowerMin` / `Max`, `burstDelayMin` / `Max`, `burstStrokesMin` / `Max`. Keep first test bed with **`burstsOn: false`**.

---

## 5. UI field map (TheSystem admin test page)

Mirror these controls → `parameters` object → POST to your controller → `AutomaticRunRequestDto` → `IDeviceGatewayClient.RunAutomaticAsync`.

| UI label | JSON field | Type | Test preset (§4.2) | Notes |
|----------|------------|------|-------------------|--------|
| Automatic mode | `automaticMode` | dropdown | `periodic` | Required |
| Min stroke (ms) | `minimumStrokeMs` | number | 25 | Device/API often 25–400 band |
| Max stroke (ms) | `maximumStrokeMs` | number | 400 | |
| Min power (%) | `minimumPower` | number 0–100 | 20 | Raise if relay too quiet |
| Max power (%) | `maximumPower` | number 0–100 | 60 | |
| Gap min (sec) | `strokeMinSeconds` | number ≥ 1 | 5 | Main stroke spacing |
| Gap max (sec) | `strokeMaxSeconds` | number ≥ 1 | 8 | |
| Delay before start (sec) | `delayBeforeStartSeconds` | number | 0 | |
| End session by | `endSessionMode` | dropdown | `strokes` | Prefer `strokes` or `minutes` for tests |
| End value | `endSessionValue` | number | 5 | Strokes or minutes per mode |
| Bursts on | `burstsOn` | boolean | false | Add burst sub-fields when true |

**Run options** (separate section or advanced):

| UI label | JSON field | Default |
|----------|------------|---------|
| Wait timeout (sec) | `waitTimeoutSeconds` | 7200 |
| Disarm after run | `disarmAfterRun` | true |
| Lock after run | `lockAfterRun` | false |

**UX**

- **Get status** → `GetDeviceStatusAsync(deviceId)`; show `local` + `device` JSON.
- **Run** → disable button until response returns (minutes possible); show `status`, `message`, `summary`, `result`.
- **Stop / Abort** → `StopAutomaticAsync(deviceId, abort)` on a **second** request while Run is pending (`POST …/automatic-stop?abort=false|true`).
- **Devices** → `ListDevicesAsync()` for admin picker when gateway has `Device:Devices[]`.
- Optional: **Reset to test preset** loads §4.2 values in the form.

**TheSystem (`SomNetVOController`):** `GET /api/SomNetVO/devices`, `GET /api/SomNetVO/status?deviceId=`, `POST /api/SomNetVO/automatic-run`, `POST /api/SomNetVO/automatic-stop?deviceId=&abort=`.

**Server merge pattern:** If the UI sends partial objects, merge with `ControlStateDefaults.Automatic` then override with user fields before building `AutomaticControlStateDto`.

---

## 6. End-to-end flow (what happens on Run)

```text
TheSystem controller
  → IDeviceGatewayClient.RunAutomaticAsync
  → Gateway POST /api/v1/automatic/run
  → AutomaticDeviceJobRunner
  → ESP: unlock (PIN) → arm → automatic-start (payloadJson) → poll status
  → idle + resultJson → summary + AutomaticRunResponseDto
```

You should hear relay activity while `automaticActive` / `busy`; session stops when end rule is met.

---

## 7. Quick verification (no UI)

PowerShell — gateway must be running; set API key header.

```powershell
$headers = @{
  "X-SomNet-Device-Gateway-Key" = "<Gateway:ApiKey>"
  "Content-Type" = "application/json"
}
$body = @'
{
  "parameters": {
    "automaticMode": "periodic",
    "minimumStrokeMs": 25,
    "maximumStrokeMs": 400,
    "minimumPower": 20,
    "maximumPower": 60,
    "strokeMinSeconds": 5,
    "strokeMaxSeconds": 8,
    "endSessionMode": "strokes",
    "endSessionValue": 5,
    "burstsOn": false
  },
  "disarmAfterRun": true
}
'@
Invoke-RestMethod -Method Post -Uri "http://localhost:5290/api/v1/automatic/run" -Headers $headers -Body $body
```

On Windows, prefer **`curl.exe`** or **`Invoke-RestMethod`** — PowerShell `curl` is an alias for `Invoke-WebRequest` and does not support `-H` the same way.

---

## 8. Callbacks, stop, and abort

### 8.1 Push callbacks to the main app?

**No.** This integration path does **not** push events from the ESP or gateway into TheSystem (no webhooks, SignalR, or MQTT on the gateway API).

| What you need | How you get it today |
|---------------|----------------------|
| **Run finished** | Same HTTP response from **`RunAutomaticAsync`** / `POST /api/v1/automatic/run` — `status`, `message`, `summary`, `result` |
| **Progress / idle check** | **Pull:** `GetDeviceStatusAsync()` — `local.automaticActive`, `local.busy`, `local.resultJson` when finished |
| **SomNet cloud UI parity** | Hub uses SignalR **`automatic-session-complete`**; **SomEsp local** exposes completion via **polling** + **`resultJson`** — the gateway job runner already polls during a run |

The device never calls TheSystem. Plan for **request/response** (blocking run) plus optional **status polling** from the UI while a run is in flight.

### 8.2 How a session ends (device)

| Mechanism | Who initiates |
|-----------|----------------|
| **End-session rule** | Payload `endSessionMode` / `endSessionValue` — recommended for admin tests |
| **`automatic-stop`** | Cooperative stop after current stroke/burst (local command) |
| **`abort`** | Hard abort (local command) — see [28 §3.4](./28-Scheduled-Jobs-Local-Device-Integration.md) |

Firmware details: [PROTOCOL.md §6.5–6.6](../SomNet.Device/docs/PROTOCOL.md).

### 8.3 What the gateway stack does today

| Capability | Supported? | Notes |
|------------|------------|--------|
| Natural end via payload | **Yes** | Primary test-bed path |
| **`automatic-stop` on host timeout** | **Yes** | `AutomaticDeviceJobRunner` → `TryStopAsync` when poll exceeds `waitTimeoutSeconds` |
| **`automatic-stop` on HTTP cancel** | **Yes (best-effort)** | If the **gateway** run’s `CancellationToken` is cancelled (e.g. client disconnects the long `POST`), runner catches `OperationCanceledException`, sends **`automatic-stop`**, returns `status: Cancelled` |
| **`abort` via stop API** | **Yes** | `StopAutomaticAsync(abort: true)` / `{ "abort": true }` on **`/automatic/stop`** (not used by job runner on timeout) |
| **`POST /api/v1/automatic/stop`** | **Yes** | Body `{ "abort": false }` — cooperative `automatic-stop`; `abort: true` sends ESP `abort`. **404** if no run on gateway |
| **`IDeviceGatewayClient.StopAutomaticAsync(abort)`** | **Yes** | Calls stop endpoint; run HTTP may still be open until device idle |
| Second run while one active | **409** | `ConcurrentRun` — does not stop the in-progress run |

`TryStopAsync` swallows device errors — stop is best-effort on timeout/cancel.

### 8.4 UI / controller patterns

**End normally** — use §4.2 end-session fields; wait for the run HTTP response.

**Show activity while waiting** — timer calling your **status** endpoint (`GetDeviceStatusAsync`); display `automaticActive` / `busy`. This does **not** stop the session.

**Cancel from the UI (v1 workaround)** — pass **`HttpContext.RequestAborted`** (or a linked token) into `RunAutomaticAsync` on the server; when the browser aborts the fetch, the gateway run should cancel and attempt **`automatic-stop`**. Verify once on hardware (relay stops after current stroke). Response: `status: Cancelled`, `message: Run cancelled.`

**Dedicated Stop button** — while a run is in progress, call **`StopAutomaticAsync(abort: false)`** (or `POST /api/v1/automatic/stop`) on a **second** HTTP client/request. The original **run** request stays open until the device finishes and returns final `summary` / `result`.

**Abort** — `StopAutomaticAsync(abort: true)` or `{ "abort": true }` on the stop endpoint (hard abort on device).

**Cancel fetch** — still works via `RequestAborted` → gateway may return `Cancelled`; prefer **stop endpoint** for operator Stop so completion metadata is preserved when possible.

### 8.5 Contrast with SomNet.API / UI

| Layer | Completion notification |
|-------|-------------------------|
| SomNet.API + hub firmware | SignalR / hub events, session rows in SQL |
| **This gateway + somesp** | Blocking HTTP result + optional status poll; main app owns history DB |

---

## 9. TheSystem integration recipes (what to add)

Use this section when extending the admin test page or scheduler in **`TheSystem.Server`** / React.

### 9.1 Suggested server endpoints (proxy pattern)

Keep **`DeviceGateway:ApiKey`** only on the server; the browser never sees it.

| TheSystem route (example) | Delegates to | Notes |
|---------------------------|--------------|--------|
| `GET /api/admin/device-gateway/status` | `GetDeviceStatusAsync()` | Fast; safe to poll every 1–2 s while running |
| `POST /api/admin/device-gateway/run` | `RunAutomaticAsync(request, correlationId, ct)` | **Long-running** — use request body from §4 / §5 |
| `POST /api/admin/device-gateway/stop?abort=false` | `StopAutomaticAsync(abort)` | **Short** — call while run is in progress |
| (optional) `GET /api/admin/device-gateway/metrics` | HTTP GET gateway `/api/v1/gateway/metrics` | Ops / debugging |

Protect all admin routes with your existing **JWT + role** policy.

### 9.2 Run controller sketch (C#)

```csharp
[Authorize(Roles = "Admin")]
[ApiController]
[Route("api/admin/device-gateway")]
public sealed class DeviceGatewayAdminController : ControllerBase
{
    private readonly IDeviceGatewayClient _gateway;

    public DeviceGatewayAdminController(IDeviceGatewayClient gateway) => _gateway = gateway;

    [HttpGet("status")]
    public Task<DeviceGatewayCombinedStatusDto> GetStatus(CancellationToken ct) =>
        _gateway.GetDeviceStatusAsync(ct);

    [HttpPost("run")]
    public async Task<ActionResult<AutomaticRunResponseDto>> Run(
        [FromBody] AutomaticRunRequestDto request,
        CancellationToken ct)
    {
        var correlationId = $"thesystem-admin-{User.Identity?.Name}-{Guid.NewGuid():N}";
        var outcome = await _gateway.RunAutomaticAsync(request, correlationId, ct);
        if (outcome.Response is null)
        {
            return StatusCode(outcome.HttpStatusCode, new { outcome.ErrorBody });
        }

        return StatusCode(outcome.HttpStatusCode, outcome.Response);
    }

    [HttpPost("stop")]
    public async Task<ActionResult<AutomaticStopResponseDto>> Stop(
        [FromQuery] bool abort = false,
        CancellationToken ct = default)
    {
        var outcome = await _gateway.StopAutomaticAsync(abort, ct);
        if (outcome.Response is null)
        {
            return StatusCode(outcome.HttpStatusCode, new { outcome.ErrorBody });
        }

        return StatusCode(outcome.HttpStatusCode, outcome.Response);
    }
}
```

Register once: `builder.Services.AddDeviceGatewayClient();` (§2).

### 9.3 React test page — recommended UX

| Control | Behavior |
|---------|----------|
| **Get status** | `GET …/status` → show `local` / `device` JSON |
| **Run** | `POST …/run` with form → §5 field map; disable Run while `isRunning` |
| **Stop** | `POST …/stop?abort=false` — **does not** cancel the Run `fetch`; run completes with final `summary` when device idles |
| **Abort** | `POST …/stop?abort=true` — hard stop on device |
| **Poll while running** | `setInterval` 1–2 s on status; show `automaticActive` / `busy` |
| **Result panel** | When Run `fetch` resolves, show `status`, `message`, `summary`, `result` |

**Important:** Use **two HTTP requests** for Run + Stop (server proxies to gateway). Do not rely on aborting the Run `fetch` unless you intentionally want `Cancelled` semantics (§8.4).

Example Stop call (fetch):

```typescript
await fetch("/api/admin/device-gateway/stop?abort=false", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
});
```

Run call: same `AutomaticRunRequestDto` shape as §3.1 (`parameters` + optional `waitTimeoutSeconds`, `disarmAfterRun`).

### 9.4 Persisting runs (optional next step)

After a successful Run response, map to DB row:

```csharp
var record = AutomaticRunJobRecordBuilder.FromGatewayResponse(
    outcome.Response!,
    jobId: null,
    scheduleId: "admin-test",
    parametersSnapshot: request.Parameters,
    gatewayCorrelationId: outcome.GatewayCorrelationId);
```

See [30](./30-Main-App-Device-Gateway-Integration.md) §4.

### 9.5 Scheduler (after admin bed is stable)

Reuse the same service the controller uses:

- `DeviceGatewaySchedulerPolicy.GetDisposition(outcome)` on failures / 409 / 502
- Skip overlapping fires; backoff on `DeviceUnreachable`

### 9.6 Gateway roadmap (not required for test page)

| ID | Feature | Status |
|----|---------|--------|
| P7-D1 | Stop / abort API | **Done** — §3.3, §8 |
| P7-D4 | Prometheus metrics | **Done** — `GET /api/v1/gateway/metrics` |
| P7-D5 | ESP JSON fixtures in tests | **Done** — `SomNet.Device.LocalClient.Tests/Fixtures/` |
| P7-D2 | Multi-device (`deviceId` routes) | **Done** — §9.7; bench with 2 ESPs optional |
| P7-D3 | mDNS / IP drift | Planned — use DHCP reservation until then |
| P5 | Docker compose smoke | Deferred |

### 9.7 Multi-device (P7-D2) — plan for TheSystem

You can run **one ESP** today; this section explains how to **design TheSystem** so adding more devices later does not require a rewrite.

#### Identity: use `deviceId`, not IP

| Field | Source | Use in TheSystem |
|-------|--------|------------------|
| **`deviceId`** | ESP `GET /api/status` → `device.deviceId` (e.g. `esp32-84CCA85C36B4`) | **Primary key** for jobs, presets, run history, UI picker |
| **`ip`** | Same status payload | Display / diagnostics only; can change with DHCP |

Your status test already returns both. When saving run logs, store **`deviceId`** even if you only own one device now.

#### v1 vs v2 gateway API

**Legacy (exactly one configured device):**

```http
GET  /api/v1/device/status
POST /api/v1/automatic/run
POST /api/v1/automatic/stop
```

**Multi-device (P7-D2):**

```http
GET  /api/v1/devices
GET  /api/v1/devices/{deviceId}/status
POST /api/v1/devices/{deviceId}/automatic/run
POST /api/v1/devices/{deviceId}/automatic/stop
```

**Client library:** `IDeviceGatewayClient` requires **`deviceId`** on status/run/stop; use `ListDevicesAsync()` for admin pickers. Host apps set **`DeviceGateway:DefaultDeviceId`** (or probe status once) for single-device deployments.

#### Gateway configuration (future)

One gateway process, many ESPs — each entry has its own **`baseUrl`** and **`pin`**:

```json
"Device": {
  "Devices": [
    { "deviceId": "esp32-84CCA85C36B4", "baseUrl": "http://192.168.1.172", "pin": "…" },
    { "deviceId": "esp32-…", "baseUrl": "http://192.168.1.173", "pin": "…" }
  ]
}
```

Secrets stay on the **gateway host**, not in TheSystem. TheSystem only needs **`DeviceGateway:BaseUrl`** + API key to talk to the gateway; it passes **`deviceId`** on each operation.

#### Concurrency expectations

```text
                    ┌─────────────────────────────────┐
  TheSystem job A   │  SomNet.Device.LocalGateway     │──► ESP #1 (deviceId A)
  TheSystem job B   │  (per-device locks in v2)       │──► ESP #2 (deviceId B)
                    └─────────────────────────────────┘
```

| Situation | Expected behavior |
|-----------|---------------------|
| Two jobs, **different** `deviceId`, v2 gateway | Both may run **in parallel** |
| Two jobs, **same** `deviceId` | Second rejected (**409** / skip policy) |
| v1 gateway (now) | Only **one** automatic run **total** — second device must wait |

Scheduler: include **`deviceId`** in job definition; `DeviceGatewaySchedulerPolicy` unchanged except routing.

#### What to build in TheSystem now (single device)

| Area | Recommendation |
|------|----------------|
| **Admin UI** | Dropdown with one row — label = `deviceId` + IP from status; structure forms as a list |
| **API** | Accept optional `deviceId` on run/stop/status; default from config if omitted |
| **Database** | **Device registration table** + `DeviceId` on presets / run history — [30 §5](./30-Main-App-Device-Gateway-Integration.md#5-planned--thesystem-device-registry-database) |
| **Config** | `DeviceGateway:DefaultDeviceId` — dev fallback only when UI omits `deviceId` |

Full design checklist: [29 — P7-D2](./29-Device-Local-Gateway-Implementation-Plan.md#p7-d2--multi-device-implemented).

**Future actuator types:** A second ESP may use an **H-bridge motor** (same LAN/gateway patterns, different payloads). Early design: [31 — Motor actuator](./31-Motor-Actuator-Device-Design.md).

---

## 10. After the test bed

| Step | Doc |
|------|-----|
| Persist runs | `AutomaticRunJobRecordDto` / `AutomaticRunJobRecordBuilder` — [30](./30-Main-App-Device-Gateway-Integration.md) §4 |
| Scheduler | Same `IDeviceGatewayClient` service; `DeviceGatewaySchedulerPolicy` for 409 / unreachable |
| Docker | Deferred — [29](./29-Device-Local-Gateway-Implementation-Plan.md) Phase 5 |

---

## 11. Document history

| Date | Change |
|------|--------|
| 2026-10-25 | Initial runbook — TheSystem admin test bed, presets, UI field map |
| 2026-10-25 | §8 — callbacks (pull-only), stop/abort/cancel vs Phase 7 stop endpoint |
| 2026-10-25 | §8 updated — `POST /api/v1/automatic/stop` + `StopAutomaticAsync` |
| 2026-10-25 | §9 TheSystem recipes; metrics; P7-D4/D5; client API table |
| 2026-10-25 | §9.7 P7-D2 multi-device planning for TheSystem |
| 2026-10-25 | §9.7 — link to doc 30 §5 TheSystem device registry (DB) |
