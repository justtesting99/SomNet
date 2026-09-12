using Microsoft.Extensions.Options;
using SomNet.Edge.Agent.Configuration;

namespace SomNet.Edge.Agent.Services;

public sealed class Go2RtcStreamManager
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly EdgeAgentSettings _settings;
    private readonly ILogger<Go2RtcStreamManager> _logger;

    public Go2RtcStreamManager(
        IHttpClientFactory httpClientFactory,
        IOptions<EdgeAgentSettings> settings,
        ILogger<Go2RtcStreamManager> logger)
    {
        _httpClientFactory = httpClientFactory;
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task EnableSessionStreamsAsync(
        string sessionId,
        string domTarget,
        string subTarget,
        CancellationToken cancellationToken = default)
    {
        var client = _httpClientFactory.CreateClient(nameof(Go2RtcStreamManager));
        var streams = await ListStreamNamesAsync(client, cancellationToken);

        foreach (var feed in new[] { "front", "rear" })
        {
            if (streams.Contains(feed, StringComparer.OrdinalIgnoreCase))
            {
                _logger.LogInformation(
                    "Session {SessionId} ({Dom}/{Sub}): stream {Feed} available on go2rtc.",
                    sessionId,
                    domTarget,
                    subTarget,
                    feed);
                continue;
            }

            _logger.LogWarning(
                "Session {SessionId} ({Dom}/{Sub}): stream {Feed} missing in go2rtc — check go2rtc.yaml.",
                sessionId,
                domTarget,
                subTarget,
                feed);
        }
    }

    public async Task DisableSessionStreamsAsync(
        string sessionId,
        CancellationToken cancellationToken = default)
    {
        // Layout A-dev USB streams stay in go2rtc.yaml; token gateway blocks access after session end.
        // Phase 7+ may DELETE RTSP pulls here to save site bandwidth.
        _logger.LogInformation(
            "Session {SessionId} ended — live access gated by revoked tokens.",
            sessionId);

        await Task.CompletedTask;
    }

    private async Task<HashSet<string>> ListStreamNamesAsync(
        HttpClient client,
        CancellationToken cancellationToken)
    {
        try
        {
            using var response = await client.GetAsync("/api/streams", cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("go2rtc /api/streams returned {StatusCode}.", response.StatusCode);
                return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await System.Text.Json.JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

            if (document.RootElement.ValueKind != System.Text.Json.JsonValueKind.Object)
            {
                return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            }

            return document.RootElement
                .EnumerateObject()
                .Select(property => property.Name)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or System.Text.Json.JsonException)
        {
            _logger.LogWarning(ex, "Unable to query go2rtc streams at {BaseUrl}.", _settings.Go2RtcBaseUrl);
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }
    }
}
