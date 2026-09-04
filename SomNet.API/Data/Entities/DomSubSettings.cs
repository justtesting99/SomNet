namespace SomNet.API.Data.Entities;

public sealed class DomSubSettings
{
    public required string DomTarget { get; set; }

    public required string SubName { get; set; }

    public required string SettingsJson { get; set; }
}
