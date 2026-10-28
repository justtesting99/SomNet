using SomNet.Shared.Enums;

namespace SomNet.Shared.DTO.DeviceGateway;

public sealed class GatewayDeviceConfigEntryDto
{
    public required string DeviceId { get; init; }

    public required string BaseUrl { get; init; }

    public string Pin { get; init; } = string.Empty;

    public ActuatorKind? ActuatorKind { get; init; }
}

public sealed class GatewayDeviceConfigDocumentDto
{
    public string? DevicesFile { get; init; }

    public bool UsesDevicesFile { get; init; }

    public required IReadOnlyList<GatewayDeviceConfigEntryDto> Devices { get; init; }
}

public sealed class GatewayDeviceConfigReplaceRequestDto
{
    public required IReadOnlyList<GatewayDeviceConfigEntryDto> Devices { get; init; }
}
