using System.Text.Json;
using SomNet.Shared.DTO.Devices;

namespace SomNet.Shared.Models;

public static class HardwareCommandKeys
{
    public const string AutomaticSessionCompleteCorrelationId = "automatic-session-complete";
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

    /// <summary>Device + API — session accessory / external lock (GPIO32).</summary>
    public const string SessionAccessory = "session-accessory";

    public static bool IsManualSnapshotCommand(string commandKey) =>
        string.Equals(commandKey, ManualStroke, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(commandKey, ManualBurst, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(commandKey, DeviceStroke, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(commandKey, DeviceBurst, StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Device hub ack when an automatic session finishes (Stop, Abort, or end-session rule).
    /// Matches firmware <c>automatic-session-complete</c> + session summary <c>resultJson</c>.
    /// </summary>
    public static bool IsAutomaticSessionEndSnapshotAck(HardwareCommandAckDto acknowledgement)
    {
        if (!string.Equals(
                acknowledgement.CorrelationId,
                AutomaticSessionCompleteCorrelationId,
                StringComparison.Ordinal))
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(acknowledgement.ResultJson))
        {
            return false;
        }

        try
        {
            using var document = JsonDocument.Parse(acknowledgement.ResultJson);
            var root = document.RootElement;

            if (root.TryGetProperty("commandKey", out var commandKeyElement))
            {
                var commandKey = commandKeyElement.GetString();
                if (!string.Equals(commandKey, AutomaticStop, StringComparison.OrdinalIgnoreCase))
                {
                    return false;
                }
            }

            if (root.TryGetProperty("endReason", out var endReasonElement) &&
                string.Equals(endReasonElement.GetString(), "error", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
