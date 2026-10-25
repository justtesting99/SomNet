using SomNet.Shared.DTO.DeviceGateway;

namespace SomNet.Device.LocalClient;

public interface IDeviceGatewayClient
{
    Task<DeviceGatewayCombinedStatusDto> GetDeviceStatusAsync(CancellationToken cancellationToken = default);

    Task<DeviceGatewayAutomaticRunResult> RunAutomaticAsync(
        AutomaticRunRequestDto request,
        string? correlationId = null,
        CancellationToken cancellationToken = default);
}
