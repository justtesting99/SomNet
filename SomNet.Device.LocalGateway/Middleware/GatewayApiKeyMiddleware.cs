using Microsoft.Extensions.Options;
using SomNet.Device.LocalGateway.Configuration;
using SomNet.Shared.DTO.DeviceGateway;

namespace SomNet.Device.LocalGateway.Middleware;

public sealed class GatewayApiKeyMiddleware
{
    public const string ApiKeyHeaderName = DeviceGatewayHttp.ApiKeyHeaderName;

    private readonly RequestDelegate _next;
    private readonly GatewaySettings _settings;

    public GatewayApiKeyMiddleware(RequestDelegate next, IOptions<GatewaySettings> settings)
    {
        _next = next;
        _settings = settings.Value;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (HttpMethods.IsGet(context.Request.Method) &&
            context.Request.Path.StartsWithSegments("/health"))
        {
            await _next(context);
            return;
        }

        var configuredKey = _settings.ApiKey?.Trim();
        if (string.IsNullOrWhiteSpace(configuredKey))
        {
            await _next(context);
            return;
        }

        if (!context.Request.Headers.TryGetValue(ApiKeyHeaderName, out var provided) ||
            !string.Equals(provided.ToString().Trim(), configuredKey, StringComparison.Ordinal))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsync("Invalid device gateway API key.");
            return;
        }

        await _next(context);
    }
}
