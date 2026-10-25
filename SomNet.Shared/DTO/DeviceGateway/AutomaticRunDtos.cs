using SomNet.Shared.DTO.Modes;

namespace SomNet.Shared.DTO.DeviceGateway;

public sealed class AutomaticRunRequestDto
{
    public required AutomaticControlStateDto Parameters { get; init; }

    public int? WaitTimeoutSeconds { get; init; }

    public bool? DisarmAfterRun { get; init; }

    public bool? LockAfterRun { get; init; }
}

public sealed class AutomaticRunResponseDto
{
    public required string Status { get; init; }

    public required string Message { get; init; }

    public string? Summary { get; init; }

    public AutomaticSessionResultDto? Result { get; init; }

    public DateTimeOffset? StartedAtUtc { get; init; }

    public DateTimeOffset? EndedAtUtc { get; init; }

    public string? DeviceCorrelationId { get; init; }
}

public sealed class DeviceGatewayCombinedStatusDto
{
    public required DeviceGatewayLocalStatusDto Local { get; init; }

    public required DeviceGatewayDeviceStatusDto Device { get; init; }
}

public sealed class DeviceGatewayLocalStatusDto
{
    public bool Unlocked { get; init; }

    public bool Armed { get; init; }

    public bool Busy { get; init; }

    public bool AutomaticActive { get; init; }

    public bool WifiConnected { get; init; }

    public bool CommandComplete { get; init; }

    public bool CommandSuccess { get; init; }

    public string? CommandMessage { get; init; }

    public string? ResultJson { get; init; }
}

public sealed class DeviceGatewayDeviceStatusDto
{
    public bool Standalone { get; init; }

    public bool HubEnabled { get; init; }

    public bool HubConnected { get; init; }

    public string? HubState { get; init; }

    public string? DeviceId { get; init; }

    public bool WifiConnected { get; init; }

    public string? Ip { get; init; }

    public string? Mode { get; init; }
}
