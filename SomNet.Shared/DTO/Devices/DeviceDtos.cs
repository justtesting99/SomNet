namespace SomNet.Shared.DTO.Devices;

public sealed class PairDeviceRequestDto
{
    public required string DeviceId { get; init; }
}

public sealed class PairDeviceResponseDto
{
    public required string DeviceId { get; init; }

    public required string DomTarget { get; init; }

    public required string SubTarget { get; init; }

    public required string AccessToken { get; init; }

    public required DateTimeOffset ExpiresAt { get; init; }

    public bool DeliveredToDevice { get; init; }

    public string? Message { get; init; }
}

public sealed class DeviceStatusResponseDto
{
    public required string DomTarget { get; init; }

    public required string SubTarget { get; init; }

    public bool IsPaired { get; init; }

    public bool IsConnected { get; init; }

    public string? DeviceId { get; init; }

    public DateTimeOffset? PairedAt { get; init; }

    public DateTimeOffset? LastConnectedAt { get; init; }

    public DateTimeOffset? TokenExpiresAt { get; init; }
}

public sealed class PairDeviceMessageDto
{
    public required string DeviceId { get; init; }

    public required string DomTarget { get; init; }

    public required string SubTarget { get; init; }

    public required string AccessToken { get; init; }

    public required DateTimeOffset ExpiresAt { get; init; }
}

public sealed class HardwareCommandMessageDto
{
    public required string CorrelationId { get; init; }

    public required string CommandKey { get; init; }

    public required string AccessToken { get; init; }

    public required string DomTarget { get; init; }

    public required string SubTarget { get; init; }

    public required string DeviceId { get; init; }

    public string PayloadJson { get; init; } = "{}";
}

public sealed class HardwareCommandAckDto
{
    public required string CorrelationId { get; init; }

    public bool Success { get; init; }

    public string? Message { get; init; }

    public string? ResultJson { get; init; }
}

public sealed class SendHardwareCommandRequestDto
{
    public required string SubTarget { get; init; }

    public required string CommandKey { get; init; }

    public string PayloadJson { get; init; } = "{}";
}

public sealed class SendHardwareCommandResponseDto
{
    public required string CorrelationId { get; init; }

    public bool Delivered { get; init; }

    public bool Acknowledged { get; init; }

    public bool Success { get; init; }

    public string? Message { get; init; }

    public string? ResultJson { get; init; }
}

public sealed class UnpairedDeviceResponseDto
{
    public required string DeviceId { get; init; }

    public required DateTimeOffset ConnectedAt { get; init; }
}
