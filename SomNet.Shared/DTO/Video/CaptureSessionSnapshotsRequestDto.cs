using SomNet.Shared.Enums;

namespace SomNet.Shared.DTO.Video;

public sealed class CaptureSessionSnapshotsRequestDto
{
    public int ActionIndex { get; init; }

    public string? CommandKey { get; init; }

    public string? CorrelationId { get; init; }

    /// <summary>One-line caption shown with action stills in session history.</summary>
    public string? ActionSummary { get; init; }

    /// <summary>When set, overrides saved pairing action-snapshot feed preference.</summary>
    public ActionSnapshotFeeds? Feeds { get; init; }
}
