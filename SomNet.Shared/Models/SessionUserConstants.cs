namespace SomNet.Shared.Models;

public static class SessionUserConstants
{
    public const string ControllerRole = "Dom";
    public const string SubRole = "Sub";
    public const string DefaultSubTarget = "Slv66";

    public static readonly IReadOnlyList<string> AvailableSubs =
    [
        "Slv66",
        "Slv67",
        "Slv68",
    ];
}
