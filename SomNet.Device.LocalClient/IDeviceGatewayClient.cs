using SomNet.Shared.DTO.DeviceGateway;

namespace SomNet.Device.LocalClient;

public interface IDeviceGatewayClient
{
    Task<IReadOnlyList<DeviceGatewayConfiguredDeviceDto>> ListDevicesAsync(
        CancellationToken cancellationToken = default);

    Task<DeviceGatewayCombinedStatusDto> GetDeviceStatusAsync(
        string deviceId,
        CancellationToken cancellationToken = default);

    Task<DeviceGatewayAutomaticRunResult> RunAutomaticAsync(
        string deviceId,
        AutomaticRunRequestDto request,
        string? correlationId = null,
        CancellationToken cancellationToken = default);

    Task<DeviceGatewayStopResult> StopAutomaticAsync(
        string deviceId,
        bool abort = false,
        CancellationToken cancellationToken = default);
}
