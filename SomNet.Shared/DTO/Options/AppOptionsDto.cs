using SomNet.Shared.Enums;

namespace SomNet.Shared.DTO.Options;

public sealed class AppOptionsDto
{
    public bool EnableSoundAlerts { get; init; } = true;

    public bool ConfirmBeforeCommands { get; init; }

    public bool AllowAutomaticModeOverrides { get; init; }

    public bool AutoExpandVideoOnMobile { get; init; } = true;

    public VideoExpandMode MobileVideoExpandDefault { get; init; } = VideoExpandMode.Both;

    public bool ShowSessionTimestamps { get; init; } = true;

    public string OperatorDisplayName { get; init; } = string.Empty;

    public string DefaultNotesPrefix { get; init; } = "Session";

    public int ReconnectIntervalSeconds { get; init; } = 10;

    /// <summary>
    /// Seconds to keep live video visible after manual stroke/burst idle, or after automatic session end.
    /// </summary>
    public int VideoFeedTimeoutSeconds { get; init; } = 30;

    /// <summary>
    /// Which camera stills to capture after each manual stroke/burst ack.
    /// </summary>
    public ActionSnapshotFeeds ActionSnapshotFeeds { get; init; } = ActionSnapshotFeeds.Both;

    /// <summary>
    /// Live viewer stream quality (maps to go2rtc stream names: front/rear, front_medium, etc.).
    /// </summary>
    public VideoFeedBandwidth VideoFeedBandwidth { get; init; } = VideoFeedBandwidth.High;
}
