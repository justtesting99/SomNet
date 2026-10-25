# Main application — device local gateway integration

**Status:** Integration guide for **Phase 6** — scheduler calls **`SomNet.Device.LocalGateway`**, persists run history in the main app DB.

| Related | Link |
|---------|------|
| Gateway implementation plan | [29 — Device local gateway](./29-Device-Local-Gateway-Implementation-Plan.md) |
| Job flow & ESP protocol | [28 — Scheduled jobs — local device](./28-Scheduled-Jobs-Local-Device-Integration.md) |
| Gateway host README | [SomNet.Device.LocalGateway/README.md](../SomNet.Device.LocalGateway/README.md) |

**Dependencies:** Reference **`SomNet.Shared`** (DTOs) and **`SomNet.Device.LocalClient`** (`AddDeviceGatewayClient`). **Do not** reference **SomNet.API**.

---

## 1. Topology

```text
Main app scheduler
  → IDeviceGatewayClient (HTTP, API key)
  → SomNet.Device.LocalGateway :5290
  → ESP /api/local/*
```

**Laptop dev:** run gateway with `dotnet run` in `SomNet.Device.LocalGateway`; main app `DeviceGateway:BaseUrl` = `http://localhost:5290`.  
**Later Docker:** same compose network URL `http://somnet-device-local-gateway:5290` (see doc 29 Phase 5).

---

## 2. Configuration

`appsettings.json` (or user secrets):

```json
{
  "DeviceGateway": {
    "BaseUrl": "http://localhost:5290",
    "ApiKey": "<same as Gateway:ApiKey on the gateway host>"
  }
}
```

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
        var outcome = await _gateway.RunAutomaticAsync(request, correlationId, cancellationToken);

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

Preflight (optional): `await _gateway.GetDeviceStatusAsync()` before POST when you want to skip early if Wi‑Fi is down.

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
| `ParametersSnapshot` | Full `AutomaticControlStateDto` sent on this run |

---

## 5. Scheduler policy (P6-D3)

| Gateway outcome | `DeviceGatewaySchedulerPolicy` | Action |
|-----------------|--------------------------------|--------|
| HTTP **409** `ConcurrentRun` | `SkipUntilNextSchedule` | Another gateway run in flight |
| **409** body `FailedPrecondition` | `SkipUntilNextSchedule` | Device busy / already active |
| **502** or status `DeviceUnreachable` | `Backoff` | Use `GetUnreachableBackoff(n)`; cap 1 hour |
| **401** / **403** | `FailConfiguration` | Fix API key; alert |
| **200** + terminal status | `Complete` | Persist record; use `Status` for alerting |

At most **one** automatic run per device; use a single gateway instance or distributed lock if multiple workers exist (doc 28 §6).

---

## 6. Manual end-to-end (laptop, no Docker)

1. Start gateway: `dotnet run` in `SomNet.Device.LocalGateway` (set `Device:BaseUrl` + `Device:Pin` for ESP).
2. Main app: `DeviceGateway:BaseUrl` = `http://localhost:5290`, matching API key.
3. Fire one scheduled job with a short session (`endSessionValue` small).
4. Confirm DB row: `status` = `Completed`, `summary` populated, `resultJson` present.

This satisfies Phase 6 exit until Linux compose smoke (Phase 5-T1) is run later.

---

## 7. Document history

| Date | Change |
|------|--------|
| 2026-10-25 | Phase 6 — client, record DTO, scheduler policy, integration guide |
