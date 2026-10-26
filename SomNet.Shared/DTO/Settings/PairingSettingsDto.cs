using SomNet.Shared.DTO.Modes;
using SomNet.Shared.DTO.Options;

namespace SomNet.Shared.DTO.Settings;

public sealed class PairingSettingsDto
{
    public AppOptionsDto AppOptions { get; init; } = AppOptionsDefaults.Value;

    public ManualControlStateDto Manual { get; init; } = ControlStateDefaults.Manual;

    public AutomaticControlStateDto Automatic { get; init; } = ControlStateDefaults.Automatic;

    public MotorAutomaticControlStateDto MotorAutomatic { get; init; } = ControlStateDefaults.MotorAutomatic;

    public VideoSettingsDto Video { get; init; } = VideoSettingsDefaults.Value;
}
