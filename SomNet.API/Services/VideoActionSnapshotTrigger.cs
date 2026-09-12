using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SomNet.API.Configuration;
using SomNet.API.Data;
using SomNet.Shared.DTO.Video;
using SomNet.Shared.Models;

namespace SomNet.API.Services;

public sealed class VideoActionSnapshotTrigger : IVideoActionSnapshotTrigger
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly VideoSnapshotSettings _settings;
    private readonly ILogger<VideoActionSnapshotTrigger> _logger;

    public VideoActionSnapshotTrigger(
        IServiceScopeFactory scopeFactory,
        Microsoft.Extensions.Options.IOptions<VideoSnapshotSettings> settings,
        ILogger<VideoActionSnapshotTrigger> logger)
    {
        _scopeFactory = scopeFactory;
        _settings = settings.Value;
        _logger = logger;
    }

    public void TryCaptureAfterAckAsync(
        string domTarget,
        string subTarget,
        string commandKey,
        int? snapshotActionIndex = null,
        CancellationToken cancellationToken = default)
    {
        if (!_settings.Enabled || !HardwareCommandKeys.IsManualSnapshotCommand(commandKey))
        {
            return;
        }

        // Fire-and-forget in a fresh scope — request-scoped DbContext is disposed before async capture finishes.
        _ = CaptureInBackgroundAsync(domTarget, subTarget, commandKey, snapshotActionIndex);
    }

    private async Task CaptureInBackgroundAsync(
        string domTarget,
        string subTarget,
        string commandKey,
        int? snapshotActionIndex)
    {
        try
        {
            await using var scope = _scopeFactory.CreateAsyncScope();
            var dataStore = scope.ServiceProvider.GetRequiredService<ISomNetDataStore>();
            var db = scope.ServiceProvider.GetRequiredService<SomNetDbContext>();
            var videoSnapshotService = scope.ServiceProvider.GetRequiredService<IVideoSnapshotService>();

            var session = dataStore.GetActiveSession(domTarget, subTarget);
            if (session is null || !SessionProgressHelper.IsInProgress(session.Summary))
            {
                _logger.LogDebug(
                    "Skipping snapshot capture — no in-progress session for {Dom}/{Sub}.",
                    domTarget,
                    subTarget);
                return;
            }

            var actionIndex = snapshotActionIndex ??
                await ResolveNextActionIndexAsync(db, session.Id, CancellationToken.None);
            var request = new CaptureSessionSnapshotsRequestDto
            {
                ActionIndex = actionIndex,
                CommandKey = commandKey,
            };

            await videoSnapshotService.CaptureForActionAsync(
                domTarget,
                session,
                request,
                CancellationToken.None);

            _logger.LogInformation(
                "Captured action snapshots for session {SessionId} actionIndex={ActionIndex} command={CommandKey}.",
                session.Id,
                actionIndex,
                commandKey);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Action snapshot capture failed for {Dom}/{Sub} command {CommandKey}.",
                domTarget,
                subTarget,
                commandKey);
        }
    }

    private static async Task<int> ResolveNextActionIndexAsync(
        SomNetDbContext db,
        string sessionId,
        CancellationToken cancellationToken)
    {
        var maxIndex = await db.SessionActionSnapshots
            .AsNoTracking()
            .Where(snapshot => snapshot.SessionId == sessionId)
            .Select(snapshot => (int?)snapshot.ActionIndex)
            .MaxAsync(cancellationToken);

        return (maxIndex ?? -1) + 1;
    }
}

public static class VideoActionSnapshotTriggerCollectionExtensions
{
    public static IServiceCollection AddVideoActionSnapshotTrigger(this IServiceCollection services)
    {
        services.AddSingleton<IVideoActionSnapshotTrigger, VideoActionSnapshotTrigger>();
        return services;
    }
}
