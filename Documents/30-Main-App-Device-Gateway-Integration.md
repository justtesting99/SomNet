# Main application — device local gateway integration

**Status:** Integration guide for **Phase 6** — scheduler calls **`SomNet.Device.LocalGateway`**, persists run history in the main app DB.

| Related | Link |
|---------|------|
| Gateway implementation plan | [29 — Device local gateway](./29-Device-Local-Gateway-Implementation-Plan.md) |
| Job flow & ESP protocol | [28 — Scheduled jobs — local device](./28-Scheduled-Jobs-Local-Device-Integration.md) |
| Gateway host README | [SomNet.Device.LocalGateway/README.md](../../TheSystem/SomNet.Device.LocalGateway/README.md) |
| **Admin test bed (payloads + UI fields + Stop/metrics)** | [SomNet integration runbook](./SomNetIntegrationRunbook.md) (§9 recipes) |
| Motor / H-bridge (draft) | [31 — Motor actuator early design](./31-Motor-Actuator-Device-Design.md) |
| TheSystem device registry (planned) | §5 below · [TheSystem `SOMNET_DEVICE_REGISTRY.md`](../../TheSystem/Docs/SOMNET_DEVICE_REGISTRY.md) |

**Dependencies:** Reference **`SomNet.Shared`** (DTOs) and **`SomNet.Device.LocalClient`** (`AddDeviceGatewayClient`). **Do not** reference **SomNet.API**.

---

## 1. Topology

```text
Main app scheduler
  → IDeviceGatewayClient (HTTP, API key)
  → SomNet.Device.LocalGateway :5290
  → ESP /api/local/*
```

**Laptop dev:** open **TheSystem** solution; run gateway with `dotnet run` in `TheSystem/SomNet.Device.LocalGateway` (or multi-startup with `TheSystem.Server`); main app `DeviceGateway:BaseUrl` = `http://localhost:5290`.  
**Later Docker:** same compose network URL `http://somnet-device-local-gateway:5290` (see doc 29 Phase 5).

---

## 2. Configuration

`appsettings.json` (or user secrets):

```json
{
  "DeviceGateway": {
    "BaseUrl": "http://localhost:5290",
    "ApiKey": "<same as Gateway:ApiKey on the gateway host>",
    "DefaultDeviceId": "esp32-84CCA85C36B4"
  }
}
```

`DefaultDeviceId` should match the ESP’s `device.deviceId` (gateway `Device:DeviceId` or `Device:Devices[].deviceId`). Omit only if the app always passes `deviceId` explicitly (e.g. from `ListDevicesAsync()`).

Environment variables: `DeviceGateway__BaseUrl`, `DeviceGateway__ApiKey`.

Register in `Program.cs`:

```csharp
builder.Services.AddDeviceGatewayClient();
```

Optional: set `DeviceGatewayClientOptions.HttpTimeout` ≥ longest `waitTimeoutSeconds` you send on `/automatic/run` (default ~2h5m).

---

## 3. Scheduled job pattern

```csharp
public sealed class AutomaticDeviceScheduledJob
{
    private readonly IDeviceGatewayClient _gateway;

    public AutomaticDeviceScheduledJob(IDeviceGatewayClient gateway) => _gateway = gateway;

    public async Task<AutomaticRunJobRecordDto> ExecuteAsync(
        string jobId,
        string scheduleId,
        AutomaticControlStateDto parameters,
        CancellationToken cancellationToken)
    {
        var request = new AutomaticRunRequestDto
        {
            Parameters = parameters,
            WaitTimeoutSeconds = 7200,
            DisarmAfterRun = true,
            LockAfterRun = false,
        };

        var correlationId = $"{jobId}:{scheduleId}";
        var deviceId = /* from job / preset, or options.DefaultDeviceId */;
        var outcome = await _gateway.RunAutomaticAsync(deviceId, request, correlationId, cancellationToken);

        var disposition = DeviceGatewaySchedulerPolicy.GetDisposition(outcome);
        if (disposition == DeviceGatewaySchedulerDisposition.SkipUntilNextSchedule)
        {
            // 409 gateway concurrent OR device FailedPrecondition — log and exit; do not tight-loop retry
            return new AutomaticRunJobRecordDto
            {
                JobId = jobId,
                ScheduleId = scheduleId,
                Status = outcome.IsGatewayConcurrentRun ? "ConcurrentRun" : outcome.Response?.Status ?? "Skipped",
                Message = outcome.Response?.Message
                    ?? "Another gateway run is in progress or device precondition failed.",
                ParametersSnapshot = parameters,
                GatewayCorrelationId = outcome.GatewayCorrelationId,
            };
        }

        if (disposition == DeviceGatewaySchedulerDisposition.Backoff)
        {
            var delay = DeviceGatewaySchedulerPolicy.GetUnreachableBackoff(consecutiveUnreachableRuns: 1);
            // Persist failure, schedule retry after `delay` (host-specific scheduler API)
            return new AutomaticRunJobRecordDto
            {
                JobId = jobId,
                ScheduleId = scheduleId,
                Status = "DeviceUnreachable",
                Message = outcome.Response?.Message ?? outcome.ErrorBody ?? "Device unreachable",
                ParametersSnapshot = parameters,
                GatewayCorrelationId = outcome.GatewayCorrelationId,
            };
        }

        if (outcome.Response is null)
        {
            throw new InvalidOperationException(
                $"Gateway HTTP {(int)outcome.HttpStatusCode}: {outcome.ErrorBody}");
        }

        return AutomaticRunJobRecordBuilder.FromGatewayResponse(
            outcome.Response,
            jobId,
            scheduleId,
            parameters,
            outcome.GatewayCorrelationId);
    }
}
```

Preflight (optional): `await _gateway.GetDeviceStatusAsync(deviceId)` before POST when you want to skip early if Wi‑Fi is down. `await _gateway.ListDevicesAsync()` to populate admin device pickers (includes **`actuatorKind`** from caps when reachable — **M3-G3**).

### 3.1 Motor automatic run (**M3**)

For NVS **`hbridge`**, send **`motorParameters`** (not relay `parameters`). Gateway builds hub-identical **`automatic-start`** JSON via **`MotorAutomaticStartPayloadBuilder`** (`SomNet.Shared`).

```csharp
var request = new AutomaticRunRequestDto
{
    ActuatorKind = ActuatorKind.Hbridge,
    MotorParameters = new MotorAutomaticControlStateDto
    {
        AutomaticMode = AutomaticRunMode.Periodic,
        EndSessionMode = EndSessionMode.Minutes,
        EndSessionValue = 1,
    },
    WaitTimeoutSeconds = 7200,
    DisarmAfterRun = true,
};
```

Gateway config (**M3-G1**): add a motor ESP to **`Device:Devices[]`** (optional **`actuatorKind`: `hbridge`** hint when caps probe fails). Relay jobs on a second **`deviceId`** unchanged (**P7-D2** parallel).

---

## 4. Persisted fields (P6-D2)

Use **`AutomaticRunJobRecordDto`** (or map to your EF entity):

| Field | Source |
|-------|--------|
| `JobId` / `ScheduleId` | Your scheduler |
| `Status` | `AutomaticRunResponseDto.Status` or `ConcurrentRun` / `DeviceUnreachable` |
| `Message` | `AutomaticRunResponseDto.Message` |
| `Summary` | SomNet-style history line |
| `ResultJson` | Serialized `result` object (raw automatic-stop shape) |
| `StartedAtUtc` / `EndedAtUtc` | Gateway host timestamps |
| `DeviceCorrelationId` | ESP `local-…` |
| `GatewayCorrelationId` | Response header `X-Correlation-Id` |
| `ParametersSnapshot` | **Program body only** — relay: `AutomaticControlStateDto`; motor: actuator-specific snapshot ([31 §5.3](./31-Motor-Actuator-Device-Design.md)). Unlock/stop envelopes are shared; store `ActuatorKind` on the run row |
| **`DeviceId`** *(planned)* | ESP identity from registration / job — see §5 |

---

## 5. Planned — TheSystem device registry (database)

**Status:** **Not implemented** — admin test bed today uses gateway `GET /api/v1/devices`, optional `DeviceGateway:DefaultDeviceId`, and query/body `deviceId`. **TheSystem.Server** will persist registrations in its own DB for presets, scheduler jobs, and run history.

**TheSystem implementation notes:** [TheSystem `Docs/SOMNET_DEVICE_REGISTRY.md`](../../TheSystem/Docs/SOMNET_DEVICE_REGISTRY.md) (sibling repo).

### 5.1 Responsibility split

| Layer | Owns |
|-------|------|
| **TheSystem DB** | Which devices this installation uses: stable **`deviceId`**, display name, enabled flag, optional **`actuatorKind`** (motor vs relay — [31](./31-Motor-Actuator-Device-Design.md)), links to presets and schedules |
| **Gateway host** | **Reachability secrets:** `Device:Devices[]` → `deviceId`, `baseUrl`, `pin` per ESP (P7-D2). Not stored in the browser; avoid duplicating PIN in the main app DB |
| **`IDeviceGatewayClient`** | Every operation passes **`deviceId`**; gateway resolves URL + PIN |

Do **not** use DHCP **IP** as the primary key for jobs or history — IPs drift ([29 §P7-D3](./29-Device-Local-Gateway-Implementation-Plan.md#p7-d3--mdns--esp-ip-drift-not-implemented)). Optional **`LastKnownIp`** on the registration row (or on run records) for display only, refreshed from `GetDeviceStatusAsync`.

### 5.2 Suggested table (sketch)

Name is illustrative (`SomNetDeviceRegistration`, `DeviceGatewayDevice`, etc.):

| Column | Notes |
|--------|--------|
| `Id` | Surrogate PK |
| `DeviceId` | **Unique**, matches firmware / `GET /api/status` → `device.deviceId` |
| `DisplayName` | Admin UI label |
| `IsEnabled` | Soft-disable without deleting history |
| `ActuatorKind` | Optional until motor ships — `relay`, `hbridge`, … |
| `LastKnownIp` | Optional, diagnostic; updated on status poll |
| `CreatedAtUtc` / `UpdatedAtUtc` | Audit |

Related tables (later): **automatic presets** and **scheduled jobs** FK or required `DeviceId` + **`ActuatorKind`**; preset body is **per-kind** (relay DTO vs motor DTO / JSON), not one shared relay shape for all devices ([31 §5.4](./31-Motor-Actuator-Device-Design.md)). **Run history** stores `DeviceId` + kind + `ParametersSnapshot` (§4).

### 5.3 Registration workflow

1. Operator configures ESP on gateway (`Device:Devices[]` or legacy single device).
2. **Admin “add device”** in TheSystem: pick from `ListDevicesAsync()` **or** paste `deviceId` after first status probe.
3. **Required:** **“Register this device as relay or motor?”** — set **`ActuatorKind`** on the row to match the **fitted module**; must match ESP NVS after bind ([31 §6.2 MA-D12](./31-Motor-Actuator-Device-Design.md)).
4. Persist row; admin UI dropdown lists **enabled** DB registrations (not only raw gateway list).
5. Optional: status/caps probe confirms `actuatorKind` matches registration before enabling schedules.
6. Optional **health job:** compare enabled `DeviceId`s in DB to gateway `GET /api/v1/devices`; flag “configured on gateway but missing in DB” or unknown id before a scheduled run.

**SomNet hub pairing (same rule):** extend `POST /api/devices/pair` + `PairDevice` with `actuatorKind` when motor ships — operator selects relay vs motor in the Hardware pairing dialog ([31 §6.2](./31-Motor-Actuator-Device-Design.md)).

> **Hub gap (2026-10-26):** SomNet.API still pairs **one ESP per Sub** (`SubDeviceRegistrations` PK). Project remit requires **multiple devices per Sub** — see [31 §12](./31-Motor-Actuator-Device-Design.md) / checklist **X-6**. Gateway multi-`deviceId` (P7-D2) is related but does not fix hub Sub pairing alone. **Interim bench:** two Subs + **X-6i** per-Sub UI scoping in [32 §2.2](./32-Motor-Actuator-Implementation-Plan-And-Checklist.md).

`DeviceGateway:DefaultDeviceId` remains a **dev fallback** when exactly one device exists and the UI does not pass an id.

### 5.4 Scheduler and admin API

- Job definition includes **`deviceId`** (from preset or registration row).
- `RunAutomaticAsync(deviceId, …)`, `StopAutomaticAsync(deviceId, …)`, `GetDeviceStatusAsync(deviceId)` — unchanged.
- TheSystem proxy routes (`SomNetVOController` today): optional `deviceId` query/body; resolve via DB selection in production instead of only `DefaultDeviceId`.

---

## 6. Scheduler policy (P6-D3)

| Gateway outcome | `DeviceGatewaySchedulerPolicy` | Action |
|-----------------|--------------------------------|--------|
| HTTP **409** `ConcurrentRun` | `SkipUntilNextSchedule` | Another gateway run in flight |
| **409** body `FailedPrecondition` | `SkipUntilNextSchedule` | Device busy / already active |
| **502** or status `DeviceUnreachable` | `Backoff` | Use `GetUnreachableBackoff(n)`; cap 1 hour |
| **401** / **403** | `FailConfiguration` | Fix API key; alert |
| **200** + terminal status | `Complete` | Persist record; use `Status` for alerting |

At most **one** automatic run per device; use a single gateway instance or distributed lock if multiple workers exist (doc 28 §6).

---

## 7. Manual end-to-end (laptop, no Docker)

1. Start gateway: `dotnet run` in `TheSystem/SomNet.Device.LocalGateway` (set `Device:BaseUrl` + `Device:Pin` for ESP).
2. Main app: `DeviceGateway:BaseUrl` = `http://localhost:5290`, matching API key.
3. Fire one scheduled job with a short session (`endSessionValue` small).
4. Confirm DB row: `status` = `Completed`, `summary` populated, `resultJson` present.

This satisfies Phase 6 exit until Linux compose smoke (Phase 5-T1) is run later.

---

## 8. Document history

| Date | Change |
|------|--------|
| 2026-10-25 | Phase 6 — client, record DTO, scheduler policy, integration guide |
| 2026-10-25 | §5 — planned TheSystem device registry (DB) |
