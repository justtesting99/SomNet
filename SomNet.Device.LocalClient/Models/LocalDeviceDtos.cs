using System.Text.Json;

namespace SomNet.Device.LocalClient.Models;

public sealed class LocalUnlockResponse
{
    public required string Token { get; init; }

    public ulong ExpiresAtMs { get; init; }

    public bool Unlocked { get; init; }
}

public sealed class LocalCommandAcceptedResponse
{
    public bool Accepted { get; init; }

    public string? CorrelationId { get; init; }
}

public sealed class LocalOperateStatus
{
    public bool Unlocked { get; init; }

    public bool Armed { get; init; }

    public bool Busy { get; init; }

    public bool AutomaticActive { get; init; }

    public bool WifiConnected { get; init; }

    public ulong ExpiresAtMs { get; init; }

    public bool CommandComplete { get; init; }

    public bool CommandSuccess { get; init; }

    public string? LastCorrelationId { get; init; }

    public string? CommandMessage { get; init; }

    /// <summary>Raw automatic-stop / command summary JSON from the device.</summary>
    public string? ResultJson { get; init; }

    public JsonDocument? TryParseResultJson()
    {
        if (string.IsNullOrWhiteSpace(ResultJson))
        {
            return null;
        }

        try
        {
            return JsonDocument.Parse(ResultJson);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}

public sealed class DeviceApiStatus
{
    public bool Standalone { get; init; }

    public bool HubNetwork { get; init; }

    public bool HubEnabled { get; init; }

    public bool HubConnected { get; init; }

    public string? HubState { get; init; }

    public string? DeviceId { get; init; }

    public string? Mac { get; init; }

    public string? FriendlyName { get; init; }

    public bool Paired { get; init; }

    public bool WifiConnected { get; init; }

    public string? Ip { get; init; }

    public string? ServerUrl { get; init; }

    public string? Mode { get; init; }
}
