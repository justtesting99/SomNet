using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SomNet.API.Configuration;
using SomNet.API.Data;
using SomNet.API.Data.Entities;
using SomNet.Shared.DTO.History;
using SomNet.Shared.DTO.Video;
using SomNet.Shared.Enums;

namespace SomNet.API.Services;

public sealed class VideoSnapshotService : IVideoSnapshotService
{
    private readonly SomNetDbContext _db;
    private readonly ISomNetDataStore _dataStore;
    private readonly VideoSnapshotSettings _settings;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<VideoSnapshotService> _logger;

    public VideoSnapshotService(
        SomNetDbContext db,
        ISomNetDataStore dataStore,
        IOptions<VideoSnapshotSettings> settings,
        IHttpClientFactory httpClientFactory,
        IWebHostEnvironment environment,
        ILogger<VideoSnapshotService> logger)
    {
        _db = db;
        _dataStore = dataStore;
        _settings = settings.Value;
        _httpClientFactory = httpClientFactory;
        _environment = environment;
        _logger = logger;
    }

    public async Task<CaptureSessionSnapshotsResponseDto?> CaptureForActionAsync(
        string domTarget,
        SessionHistoryEntryDto session,
        CaptureSessionSnapshotsRequestDto request,
        CancellationToken cancellationToken = default)
    {
        if (!_settings.Enabled)
        {
            return new CaptureSessionSnapshotsResponseDto { Snapshots = [] };
        }

        if (request.ActionIndex < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(request), "ActionIndex must be non-negative.");
        }

        var feeds = request.Feeds ??
            _dataStore.GetPairingSettings(domTarget, session.SubTarget).AppOptions.ActionSnapshotFeeds;
        var captureFront = ShouldCaptureFeed(feeds, "front");
        var captureRear = ShouldCaptureFeed(feeds, "rear");

        var snapshots = new List<SessionActionSnapshotDto>();

        if (captureFront)
        {
            var front = await CaptureFeedAsync(
                domTarget,
                session,
                request,
                _settings.FrontStreamName,
                "front",
                cancellationToken);

            if (front is not null)
            {
                snapshots.Add(front);
            }
        }

        if (captureRear && _settings.RearSettleDelayMs > 0)
        {
            await Task.Delay(_settings.RearSettleDelayMs, cancellationToken);
        }

        if (!captureRear)
        {
            return new CaptureSessionSnapshotsResponseDto { Snapshots = snapshots };
        }

        var rear = await CaptureFeedAsync(
            domTarget,
            session,
            request,
            _settings.RearStreamName,
            "rear",
            cancellationToken);

        if (rear is not null)
        {
            snapshots.Add(rear);
        }

        return new CaptureSessionSnapshotsResponseDto { Snapshots = snapshots };
    }

    public async Task<IReadOnlyList<SessionActionSnapshotDto>> ListForSessionAsync(
        string domTarget,
        string sessionId)
    {
        var rows = await _db.SessionActionSnapshots
            .AsNoTracking()
            .Where(snapshot =>
                snapshot.DomTarget == domTarget.Trim() &&
                snapshot.SessionId == sessionId.Trim())
            .OrderBy(snapshot => snapshot.ActionIndex)
            .ThenBy(snapshot => snapshot.Feed)
            .ToListAsync();

        return rows.Select(ToDto).ToList();
    }

    public async Task<(SessionActionSnapshotDto Metadata, string AbsolutePath)?> GetImageAsync(
        string domTarget,
        int snapshotId)
    {
        var row = await _db.SessionActionSnapshots
            .AsNoTracking()
            .SingleOrDefaultAsync(snapshot =>
                snapshot.Id == snapshotId &&
                snapshot.DomTarget == domTarget.Trim());

        if (row is null)
        {
            return null;
        }

        var absolutePath = ResolveAbsolutePath(row.RelativePath);
        if (!File.Exists(absolutePath))
        {
            return null;
        }

        return (ToDto(row), absolutePath);
    }

    private async Task<SessionActionSnapshotDto?> CaptureFeedAsync(
        string domTarget,
        SessionHistoryEntryDto session,
        CaptureSessionSnapshotsRequestDto request,
        string streamName,
        string feed,
        CancellationToken cancellationToken)
    {
        var jpegBytes = await FetchFrameAsync(streamName, cancellationToken);
        if (jpegBytes is null || jpegBytes.Length == 0)
        {
            _logger.LogWarning(
                "Snapshot skipped for session {SessionId} action {ActionIndex} feed {Feed} — go2rtc frame unavailable.",
                session.Id,
                request.ActionIndex,
                feed);
            return null;
        }

        var relativePath = BuildRelativePath(domTarget, session.Id, request.ActionIndex, feed);
        var absolutePath = ResolveAbsolutePath(relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(absolutePath)!);
        await File.WriteAllBytesAsync(absolutePath, jpegBytes, cancellationToken);

        var existing = await _db.SessionActionSnapshots.SingleOrDefaultAsync(
            snapshot =>
                snapshot.SessionId == session.Id &&
                snapshot.ActionIndex == request.ActionIndex &&
                snapshot.Feed == feed,
            cancellationToken);

        var capturedAt = DateTimeOffset.UtcNow;

        if (existing is null)
        {
            existing = new SessionActionSnapshot
            {
                SessionId = session.Id,
                DomTarget = domTarget.Trim(),
                ActionIndex = request.ActionIndex,
                Feed = feed,
                RelativePath = relativePath,
                CapturedAt = capturedAt,
                CommandKey = request.CommandKey,
                CorrelationId = request.CorrelationId,
            };
            _db.SessionActionSnapshots.Add(existing);
        }
        else
        {
            existing.RelativePath = relativePath;
            existing.CapturedAt = capturedAt;
            existing.CommandKey = request.CommandKey;
            existing.CorrelationId = request.CorrelationId;
        }

        await _db.SaveChangesAsync(cancellationToken);
        return ToDto(existing);
    }

    private async Task<byte[]?> FetchFrameAsync(string streamName, CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient(VideoSnapshotServiceCollectionExtensions.Go2RtcHttpClientName);
        var baseUrl = _settings.Go2RtcBaseUrl.TrimEnd('/');
        var requestUri =
            $"{baseUrl}/api/frame.jpeg?src={Uri.EscapeDataString(streamName)}";

        using var response = await client.GetAsync(requestUri, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning(
                "go2rtc frame request failed for stream {StreamName}: {StatusCode}",
                streamName,
                (int)response.StatusCode);
            return null;
        }

        return await response.Content.ReadAsByteArrayAsync(cancellationToken);
    }

    internal static bool ShouldCaptureFeed(ActionSnapshotFeeds feeds, string feed) =>
        feeds == ActionSnapshotFeeds.Both ||
        string.Equals(feed, "rear", StringComparison.OrdinalIgnoreCase);

    internal static string BuildRelativePath(
        string domTarget,
        string sessionId,
        int actionIndex,
        string feed)
    {
        var safeDom = SanitizePathSegment(domTarget);
        var safeSession = SanitizePathSegment(sessionId);
        return Path.Combine(safeDom, safeSession, $"{actionIndex:D3}-{feed}.jpg");
    }

    internal static string SanitizePathSegment(string value)
    {
        var trimmed = value.Trim();
        if (trimmed.Length == 0)
        {
            return "_";
        }

        var invalid = Path.GetInvalidFileNameChars();
        var chars = trimmed.Select(ch => invalid.Contains(ch) ? '_' : ch).ToArray();
        return new string(chars);
    }

    private string ResolveAbsolutePath(string relativePath)
    {
        var root = _settings.StorageRoot.Trim();
        if (!Path.IsPathRooted(root))
        {
            root = Path.GetFullPath(Path.Combine(_environment.ContentRootPath, root));
        }

        return Path.GetFullPath(Path.Combine(root, relativePath));
    }

    private static SessionActionSnapshotDto ToDto(SessionActionSnapshot row) =>
        new()
        {
            Id = row.Id,
            SessionId = row.SessionId,
            ActionIndex = row.ActionIndex,
            Feed = row.Feed,
            ImageUrl = $"/api/video/snapshots/{row.Id}/image",
            CapturedAt = row.CapturedAt,
            CommandKey = row.CommandKey,
            CorrelationId = row.CorrelationId,
        };
}

public static class VideoSnapshotServiceCollectionExtensions
{
    public const string Go2RtcHttpClientName = "go2rtc-snapshots";

    public static IServiceCollection AddVideoSnapshotServices(this IServiceCollection services)
    {
        services.AddHttpClient(Go2RtcHttpClientName, client =>
        {
            client.Timeout = TimeSpan.FromSeconds(15);
        });
        services.AddScoped<IVideoSnapshotService, VideoSnapshotService>();
        return services;
    }
}
