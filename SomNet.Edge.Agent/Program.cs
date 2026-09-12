using SomNet.Edge.Agent.Configuration;
using SomNet.Edge.Agent.Middleware;
using SomNet.Edge.Agent.Services;
using SomNet.Shared.DTO.Video;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddOptions<EdgeAgentSettings>()
    .Bind(builder.Configuration.GetSection(EdgeAgentSettings.SectionName));

builder.Services.AddSingleton<EdgeSessionStore>();
builder.Services.AddSingleton<Go2RtcStreamManager>();

builder.Services.AddHttpClient(nameof(Go2RtcStreamManager), (services, client) =>
{
    var settings = services.GetRequiredService<Microsoft.Extensions.Options.IOptions<EdgeAgentSettings>>().Value;
    client.BaseAddress = new Uri(settings.Go2RtcBaseUrl.TrimEnd('/') + "/");
    client.Timeout = TimeSpan.FromSeconds(10);
});

var app = builder.Build();

app.UseMiddleware<EdgeApiKeyMiddleware>();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapGet("/api/edge/sessions", (EdgeSessionStore store) =>
    Results.Ok(store.GetActiveSessions()));

app.MapPost("/api/edge/session-started", async (
    VideoSessionStartedDto request,
    EdgeSessionStore store,
    Go2RtcStreamManager streams,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.SessionId) ||
        string.IsNullOrWhiteSpace(request.DomTarget) ||
        string.IsNullOrWhiteSpace(request.SubTarget))
    {
        return Results.BadRequest("sessionId, domTarget, and subTarget are required.");
    }

    store.MarkStarted(request.SessionId, request.DomTarget, request.SubTarget, request.Mode);
    await streams.EnableSessionStreamsAsync(
        request.SessionId,
        request.DomTarget,
        request.SubTarget,
        cancellationToken);

    return Results.Ok(new { accepted = true });
});

app.MapPost("/api/edge/session-ended", async (
    VideoSessionEndedDto request,
    EdgeSessionStore store,
    Go2RtcStreamManager streams,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.SessionId))
    {
        return Results.BadRequest("sessionId is required.");
    }

    store.MarkEnded(request.SessionId);
    await streams.DisableSessionStreamsAsync(request.SessionId, cancellationToken);

    return Results.Ok(new { accepted = true });
});

app.Run();
