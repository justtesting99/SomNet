using SomNet.Shared.DTO.History;
using SomNet.Shared.DTO.Video;

namespace SomNet.API.Services;

public interface IVideoSnapshotService
{
    Task<CaptureSessionSnapshotsResponseDto?> CaptureForActionAsync(
        string domTarget,
        SessionHistoryEntryDto session,
        CaptureSessionSnapshotsRequestDto request,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<SessionActionSnapshotDto>> ListForSessionAsync(
        string domTarget,
        string sessionId);

    Task<(SessionActionSnapshotDto Metadata, string AbsolutePath)?> GetImageAsync(
        string domTarget,
        int snapshotId);
}
