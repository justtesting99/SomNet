using SomNet.Shared.DTO.Options;
using SomNet.Shared.Enums;

namespace SomNet.Shared.Modes;

public static class MotorSegmentTargetRampResolver
{
    public static bool ModeUsesFullSegmentRamp(AutomaticRunMode mode) =>
        mode is AutomaticRunMode.PowerWave or AutomaticRunMode.BuildUp;

    /// <summary>
    /// Wire value for motor <c>automatic-start</c> <c>segmentTargetRampMs</c> (see PROTOCOL / SomNet.UI).
    /// </summary>
    public static int ResolveSegmentTargetRampMs(
        AutomaticRunMode mode,
        AppOptionsDto? appOptions)
    {
        if (ModeUsesFullSegmentRamp(mode))
        {
            return -1;
        }

        var options = appOptions ?? AppOptionsDefaults.Value;
        return options.MotorSegmentTargetRampMode.Trim().ToLowerInvariant() switch
        {
            "instant" => 0,
            "fixedms" => Math.Clamp(options.MotorSegmentTargetRampMs, 0, 30_000),
            _ => -1,
        };
    }
}
