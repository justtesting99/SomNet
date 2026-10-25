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

        app.MapGet("/api/v1/device/status", async (
            DeviceGatewayStatusService statusService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                return Results.Ok(await statusService.GetCombinedStatusAsync(cancellationToken));
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
            AutomaticRunCoordinator coordinator,
            HttpContext httpContext,
            CancellationToken cancellationToken) =>
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
                request.Parameters,
                runOptions,
                correlationId,
                cancellationToken);

            if (coordinatorResult.IsConcurrent)
            {
                return Results.Conflict(new
                {
                    status = "ConcurrentRun",
                    message = "Another automatic run is already in progress on this gateway.",
                });
            }

            var job = coordinatorResult.Job!;
            var dto = AutomaticRunResponseMapper.ToDto(job);
            var statusCode = AutomaticRunResponseMapper.MapToStatusCode(job.Status);
            return Results.Json(dto, statusCode: statusCode);
        });
    }
}
