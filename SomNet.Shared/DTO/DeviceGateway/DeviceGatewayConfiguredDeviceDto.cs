using SomNet.Shared.Enums;

namespace SomNet.Shared.DTO.DeviceGateway;

public sealed class DeviceGatewayConfiguredDeviceDto
{
    public required string DeviceId { get; init; }

    /// <summary>From gateway caps probe or config (M3-G3).</summary>
    public ActuatorKind? ActuatorKind { get; init; }
}
