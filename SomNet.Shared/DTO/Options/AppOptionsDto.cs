using SomNet.Shared.Enums;

namespace SomNet.Shared.DTO.Options;

public sealed class AppOptionsDto
{
    public bool EnableSoundAlerts { get; init; } = true;

    public bool ConfirmBeforeCommands { get; init; }

    public bool AutoExpandVideoOnMobile { get; init; } = true;

    public VideoExpandMode MobileVideoExpandDefault { get; init; } = VideoExpandMode.Both;

    public bool ShowSessionTimestamps { get; init; } = true;

    public string OperatorDisplayName { get; init; } = string.Empty;

    public string DefaultNotesPrefix { get; init; } = "Session";

    public int ReconnectIntervalSeconds { get; init; } = 10;
}
