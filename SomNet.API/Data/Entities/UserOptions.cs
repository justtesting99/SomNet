using SomNet.Shared.Enums;

namespace SomNet.API.Data.Entities;

public sealed class UserOptions
{
    public required string Username { get; set; }

    public bool EnableSoundAlerts { get; set; } = true;

    public bool ConfirmBeforeCommands { get; set; }

    public bool AutoExpandVideoOnMobile { get; set; } = true;

    public VideoExpandMode MobileVideoExpandDefault { get; set; } = VideoExpandMode.Both;

    public bool ShowSessionTimestamps { get; set; } = true;

    public string OperatorDisplayName { get; set; } = string.Empty;

    public string DefaultNotesPrefix { get; set; } = "Session";

    public int ReconnectIntervalSeconds { get; set; } = 10;
}
