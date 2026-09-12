namespace SomNet.Shared.DTO.Video;

public sealed class CaptureSessionSnapshotsRequestDto
{
    public int ActionIndex { get; init; }

    public string? CommandKey { get; init; }

    public string? CorrelationId { get; init; }
}
