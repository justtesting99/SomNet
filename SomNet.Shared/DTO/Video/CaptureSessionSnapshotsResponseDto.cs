namespace SomNet.Shared.DTO.Video;

public sealed class CaptureSessionSnapshotsResponseDto
{
    public required IReadOnlyList<SessionActionSnapshotDto> Snapshots { get; init; }
}
