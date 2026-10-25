using SomNet.Device.LocalClient;
using SomNet.Device.LocalClient.Models;
using SomNet.Shared.DTO.DeviceGateway;

namespace SomNet.Device.LocalGateway.Services;

public sealed class DeviceGatewayStatusService
{
    private readonly ISomEspLocalSessionClient _client;

    public DeviceGatewayStatusService(ISomEspLocalSessionClient client)
    {
        _client = client;
    }

    public async Task<DeviceGatewayCombinedStatusDto> GetCombinedStatusAsync(
        CancellationToken cancellationToken = default)
    {
        var local = await _client.GetLocalStatusAsync(cancellationToken);
        var device = await _client.GetDeviceStatusAsync(cancellationToken);

        return new DeviceGatewayCombinedStatusDto
        {
            Local = MapLocal(local),
            Device = MapDevice(device),
        };
    }

    private static DeviceGatewayLocalStatusDto MapLocal(LocalOperateStatus local) => new()
    {
        Unlocked = local.Unlocked,
        Armed = local.Armed,
        Busy = local.Busy,
        AutomaticActive = local.AutomaticActive,
        WifiConnected = local.WifiConnected,
        CommandComplete = local.CommandComplete,
        CommandSuccess = local.CommandSuccess,
        CommandMessage = local.CommandMessage,
        ResultJson = local.ResultJson,
    };

    private static DeviceGatewayDeviceStatusDto MapDevice(DeviceApiStatus device) => new()
    {
        Standalone = device.Standalone,
        HubEnabled = device.HubEnabled,
        HubConnected = device.HubConnected,
        HubState = device.HubState,
        DeviceId = device.DeviceId,
        WifiConnected = device.WifiConnected,
        Ip = device.Ip,
        Mode = device.Mode,
    };
}
