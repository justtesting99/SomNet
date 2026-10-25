using SomNet.Shared.DTO.DeviceGateway;

namespace SomNet.Device.LocalGateway.Middleware;

public sealed class GatewayCorrelationMiddleware
{
    public const string CorrelationItemKey = "GatewayCorrelationId";
    public const string CorrelationHeaderName = DeviceGatewayHttp.CorrelationHeaderName;

    private readonly RequestDelegate _next;

    public GatewayCorrelationMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var correlationId = context.Request.Headers[CorrelationHeaderName].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(correlationId))
        {
            correlationId = Guid.NewGuid().ToString("N");
        }

        context.Items[CorrelationItemKey] = correlationId;
        context.Response.Headers[CorrelationHeaderName] = correlationId;
        await _next(context);
    }
}
