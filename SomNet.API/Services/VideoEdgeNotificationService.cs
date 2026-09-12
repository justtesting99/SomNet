using Microsoft.Extensions.Options;
using SomNet.API.Configuration;
using SomNet.Shared.DTO.History;
using SomNet.Shared.DTO.Video;

namespace SomNet.API.Services;

public sealed class VideoEdgeNotificationService : IVideoEdgeNotificationService
{
    internal const string HttpClientName = "SomNetVideoEdgeAgent";
    internal const string ApiKeyHeaderName = "X-SomNet-Edge-Key";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly VideoEdgeSettings _settings;
    private readonly ILogger<VideoEdgeNotificationService> _logger;

    public VideoEdgeNotificationService(
        IHttpClientFactory httpClientFactory,
        IOptions<VideoEdgeSettings> settings,
        ILogger<VideoEdgeNotificationService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _settings = settings.Value;
        _logger = logger;
    }

    public void NotifySessionStarted(SessionHistoryEntryDto session)
    {
        if (!_settings.Enabled)
        {
            return;
        }

        var payload = new VideoSessionStartedDto
        {
            SessionId = session.Id,
            DomTarget = session.DomTarget,
            SubTarget = session.SubTarget,
            Mode = session.Mode.ToString(),
        };

        _ = PostFireAndForgetAsync("/api/edge/session-started", payload, session.Id, "started");
    }

    public void NotifySessionEnded(string sessionId, string domTarget, string subTarget)
    {
        if (!_settings.Enabled)
        {
            return;
        }

        var payload = new VideoSessionEndedDto
        {
            SessionId = sessionId,
            DomTarget = domTarget,
            SubTarget = subTarget,
        };

        _ = PostFireAndForgetAsync("/api/edge/session-ended", payload, sessionId, "ended");
    }

    private async Task PostFireAndForgetAsync<T>(string path, T payload, string sessionId, string verb)
    {
        try
        {
            var client = _httpClientFactory.CreateClient(HttpClientName);
            using var request = new HttpRequestMessage(HttpMethod.Post, path)
            {
                Content = JsonContent.Create(payload),
            };

            if (!string.IsNullOrWhiteSpace(_settings.ApiKey))
            {
                request.Headers.TryAddWithoutValidation(ApiKeyHeaderName, _settings.ApiKey.Trim());
            }

            using var response = await client.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Edge agent session {Verb} notify for {SessionId} returned {StatusCode}.",
                    verb,
                    sessionId,
                    response.StatusCode);
            }
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            _logger.LogWarning(
                ex,
                "Edge agent session {Verb} notify for {SessionId} failed.",
                verb,
                sessionId);
        }
    }
}

public static class VideoEdgeServiceCollectionExtensions
{
    public static IServiceCollection AddVideoEdgeServices(this IServiceCollection services)
    {
        services.AddHttpClient(VideoEdgeNotificationService.HttpClientName, (provider, client) =>
        {
            var settings = provider.GetRequiredService<Microsoft.Extensions.Options.IOptions<VideoEdgeSettings>>().Value;
            client.BaseAddress = new Uri(settings.AgentBaseUrl.TrimEnd('/') + "/");
            client.Timeout = TimeSpan.FromSeconds(5);
        });

        services.AddSingleton<IVideoEdgeNotificationService, VideoEdgeNotificationService>();
        return services;
    }
}
