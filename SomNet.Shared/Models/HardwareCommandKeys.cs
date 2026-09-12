namespace SomNet.Shared.Models;

public static class HardwareCommandKeys
{
    /// <summary>UI / tab-sync pending key.</summary>
    public const string ManualStroke = "manual:stroke";

    /// <summary>UI / tab-sync pending key.</summary>
    public const string ManualBurst = "manual:burst";

    /// <summary>Device + API command key (ExecuteCommand).</summary>
    public const string DeviceStroke = "stroke";

    /// <summary>Device + API command key (ExecuteCommand).</summary>
    public const string DeviceBurst = "burst";

    public const string ManualAbort = "manual:abort";

    public const string AutomaticStart = "automatic-start";

    public const string AutomaticStop = "automatic-stop";

    public const string AutomaticUpdate = "automatic-update";

    public static bool IsManualSnapshotCommand(string commandKey) =>
        string.Equals(commandKey, ManualStroke, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(commandKey, ManualBurst, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(commandKey, DeviceStroke, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(commandKey, DeviceBurst, StringComparison.OrdinalIgnoreCase);
}
