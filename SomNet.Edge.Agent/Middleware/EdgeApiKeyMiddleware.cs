using Microsoft.Extensions.Options;
using SomNet.Edge.Agent.Configuration;

namespace SomNet.Edge.Agent.Middleware;

public sealed class EdgeApiKeyMiddleware
{
    private const string ApiKeyHeaderName = "X-SomNet-Edge-Key";
    private readonly RequestDelegate _next;
    private readonly EdgeAgentSettings _settings;

    public EdgeApiKeyMiddleware(RequestDelegate next, IOptions<EdgeAgentSettings> settings)
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
            await context.Response.WriteAsync("Invalid edge API key.");
            return;
        }

        await _next(context);
    }
}
