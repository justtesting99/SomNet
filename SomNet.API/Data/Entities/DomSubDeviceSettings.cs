namespace SomNet.API.Data.Entities;

public sealed class DomSubDeviceSettings
{
    public required string DomTarget { get; set; }

    public required string SubName { get; set; }

    public required string DeviceId { get; set; }

    public required string SettingsJson { get; set; }
}
