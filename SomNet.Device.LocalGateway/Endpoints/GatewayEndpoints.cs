using SomNet.Device.LocalClient;
using SomNet.Device.LocalGateway.Mapping;
using SomNet.Device.LocalGateway.Middleware;
using SomNet.Device.LocalGateway.Services;
using SomNet.Shared.DTO.DeviceGateway;

namespace SomNet.Device.LocalGateway.Endpoints;

internal static class GatewayEndpoints
{
    public static void MapGatewayEndpoints(this WebApplication app)
    {
        app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

        app.MapGet("/api/v1/gateway/metrics", (GatewayRunMetrics metrics) =>
            Results.Text(metrics.ToPrometheusText(), "text/plain; version=0.0.4; charset=utf-8"));

        app.MapGet("/api/v1/devices", (IConfiguredDeviceRegistry registry) =>
            Results.Ok(registry.All.Select(d => new DeviceGatewayConfiguredDeviceDto
            {
                DeviceId = d.DeviceId,
            })));

        MapDeviceScopedEndpoints(app);
        MapLegacySingleDeviceEndpoints(app);
    }

    private static void MapDeviceScopedEndpoints(WebApplication app)
    {
        app.MapGet("/api/v1/devices/{deviceId}/status", async (
            string deviceId,
            DeviceGatewayStatusService statusService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                return Results.Ok(await statusService.GetCombinedStatusAsync(deviceId, cancellationToken));
            }
            catch (UnknownConfiguredDeviceException ex)
            {
                return GatewayDeviceRoutes.UnknownDevice(ex);
            }
            catch (SomEspLocalApiException ex)
            {
                return Results.Json(
                    new { error = ex.DeviceErrorCode ?? "device_error", message = ex.Message },
                    statusCode: StatusCodes.Status502BadGateway);
            }
            catch (HttpRequestException ex)
            {
                return Results.Json(
                    new { error = "device_unreachable", message = ex.Message },
                    statusCode: StatusCodes.Status502BadGateway);
            }
        });

        app.MapPost("/api/v1/devices/{deviceId}/automatic/run", async (
            string deviceId,
            AutomaticRunRequestDto? request,
            AutomaticRunCoordinator coordinator,
            HttpContext httpContext,
            CancellationToken cancellationToken) =>
        {
            try
            {
                return await ExecuteAutomaticRunAsync(
                    deviceId,
                    request,
                    coordinator,
                    httpContext,
                    cancellationToken);
            }
            catch (UnknownConfiguredDeviceException ex)
            {
                return GatewayDeviceRoutes.UnknownDevice(ex);
            }
        });

        app.MapPost("/api/v1/devices/{deviceId}/automatic/stop", async (
            string deviceId,
            AutomaticStopRequestDto? request,
            AutomaticRunCoordinator coordinator,
            HttpContext httpContext,
            CancellationToken cancellationToken) =>
        {
            try
            {
                return await ExecuteAutomaticStopAsync(
                    deviceId,
                    request,
                    coordinator,
                    httpContext,
                    cancellationToken);
            }
            catch (UnknownConfiguredDeviceException ex)
            {
                return GatewayDeviceRoutes.UnknownDevice(ex);
            }
        });
    }

    private static void MapLegacySingleDeviceEndpoints(WebApplication app)
    {
        app.MapGet("/api/v1/device/status", async (
            IConfiguredDeviceRegistry registry,
            DeviceGatewayStatusService statusService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var deviceId = GatewayDeviceRoutes.ResolveLegacyDeviceId(registry);
                return Results.Ok(await statusService.GetCombinedStatusAsync(deviceId, cancellationToken));
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { error = "legacy_route_unavailable", message = ex.Message });
            }
            catch (SomEspLocalApiException ex)
            {
                return Results.Json(
                    new { error = ex.DeviceErrorCode ?? "device_error", message = ex.Message },
                    statusCode: StatusCodes.Status502BadGateway);
            }
            catch (HttpRequestException ex)
            {
                return Results.Json(
                    new { error = "device_unreachable", message = ex.Message },
                    statusCode: StatusCodes.Status502BadGateway);
            }
        });

        app.MapPost("/api/v1/automatic/run", async (
            AutomaticRunRequestDto? request,
            IConfiguredDeviceRegistry registry,
            AutomaticRunCoordinator coordinator,
            HttpContext httpContext,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var deviceId = GatewayDeviceRoutes.ResolveLegacyDeviceId(registry);
                return await ExecuteAutomaticRunAsync(
                    deviceId,
                    request,
                    coordinator,
                    httpContext,
                    cancellationToken);
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { error = "legacy_route_unavailable", message = ex.Message });
            }
            catch (UnknownConfiguredDeviceException ex)
            {
                return GatewayDeviceRoutes.UnknownDevice(ex);
            }
        });

        app.MapPost("/api/v1/automatic/stop", async (
            AutomaticStopRequestDto? request,
            IConfiguredDeviceRegistry registry,
            AutomaticRunCoordinator coordinator,
            HttpContext httpContext,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var deviceId = GatewayDeviceRoutes.ResolveLegacyDeviceId(registry);
                return await ExecuteAutomaticStopAsync(
                    deviceId,
                    request,
                    coordinator,
                    httpContext,
                    cancellationToken);
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { error = "legacy_route_unavailable", message = ex.Message });
            }
            catch (UnknownConfiguredDeviceException ex)
            {
                return GatewayDeviceRoutes.UnknownDevice(ex);
            }
        });
    }

    private static async Task<IResult> ExecuteAutomaticRunAsync(
        string deviceId,
        AutomaticRunRequestDto? request,
        AutomaticRunCoordinator coordinator,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        if (request?.Parameters is null)
        {
            return Results.BadRequest("parameters is required.");
        }

        var correlationId = httpContext.Items[GatewayCorrelationMiddleware.CorrelationItemKey] as string
            ?? Guid.NewGuid().ToString("N");

        var runOptions = new AutomaticDeviceJobRunOptions
        {
            WaitTimeout = TimeSpan.FromSeconds(
                request.WaitTimeoutSeconds is > 0 ? request.WaitTimeoutSeconds.Value : 7200),
            DisarmAfterRun = request.DisarmAfterRun ?? true,
            LockAfterRun = request.LockAfterRun ?? false,
        };

        var coordinatorResult = await coordinator.RunAsync(
            deviceId,
            request.Parameters,
            runOptions,
            correlationId,
            cancellationToken);

        if (coordinatorResult.IsConcurrent)
        {
            return Results.Conflict(new
            {
                status = "ConcurrentRun",
                message = $"Another automatic run is already in progress on device '{deviceId}'.",
                deviceId,
            });
        }

        var job = coordinatorResult.Job!;
        var dto = AutomaticRunResponseMapper.ToDto(job);
        var statusCode = AutomaticRunResponseMapper.MapToStatusCode(job.Status);
        return Results.Json(dto, statusCode: statusCode);
    }

    private static async Task<IResult> ExecuteAutomaticStopAsync(
        string deviceId,
        AutomaticStopRequestDto? request,
        AutomaticRunCoordinator coordinator,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        var correlationId = httpContext.Items[GatewayCorrelationMiddleware.CorrelationItemKey] as string
            ?? Guid.NewGuid().ToString("N");

        var stopResult = await coordinator.StopActiveRunAsync(
            deviceId,
            request?.Abort ?? false,
            correlationId,
            cancellationToken);

        if (!stopResult.HasActiveRun)
        {
            return Results.NotFound(new AutomaticStopResponseDto
            {
                Status = "NoActiveRun",
                Message = $"No automatic run is in progress on device '{deviceId}'.",
            });
        }

        if (!stopResult.IsStopAccepted)
        {
            return Results.Json(
                new AutomaticStopResponseDto
                {
                    Status = "DeviceError",
                    Message = stopResult.ErrorMessage ?? "Device rejected stop.",
                },
                statusCode: StatusCodes.Status502BadGateway);
        }

        return Results.Ok(new AutomaticStopResponseDto
        {
            Status = "StopAccepted",
            Message =
                $"Stop command '{stopResult.CommandKey}' accepted for device '{deviceId}'; run request will complete when the device is idle.",
        });
    }
}
