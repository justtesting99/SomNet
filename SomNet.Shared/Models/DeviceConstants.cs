namespace SomNet.Shared.Models;

public static class DeviceClaimTypes
{
    public const string Role = "role";

    public const string DeviceRole = "device";

    public const string OperatorRole = "operator";

    public const string DomTarget = "dom";

    public const string SubTarget = "sub_target";

    public const string DeviceId = "device_id";
}

public static class HardwareHubGroups
{
    public static string Unpaired(string deviceId) => $"unpaired:{deviceId.Trim()}";

    public static string Paired(string domTarget, string subTarget) =>
        $"paired:{domTarget.Trim()}:{subTarget.Trim()}";

    public static string Operator(string domTarget) => $"operator:{domTarget.Trim()}";
}

public static class HardwareHubMethods
{
    public const string PairDevice = "PairDevice";

    public const string ExecuteCommand = "ExecuteCommand";

    public const string CommandAcknowledged = "CommandAcknowledged";

    public const string AckCommand = "AckCommand";
}
