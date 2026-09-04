using SomNet.Shared.Enums;

namespace SomNet.Shared.DTO.Options;

public static class AppOptionsDefaults
{
    public static AppOptionsDto Value { get; } = new()
    {
        EnableSoundAlerts = true,
        ConfirmBeforeCommands = false,
        AutoExpandVideoOnMobile = true,
        MobileVideoExpandDefault = VideoExpandMode.Both,
        ShowSessionTimestamps = true,
        OperatorDisplayName = string.Empty,
        DefaultNotesPrefix = "Session",
        ReconnectIntervalSeconds = 10,
    };
}
