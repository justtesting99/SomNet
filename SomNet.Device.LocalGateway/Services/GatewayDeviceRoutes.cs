using SomNet.Device.LocalClient;

namespace SomNet.Device.LocalGateway.Services;

internal static class GatewayDeviceRoutes
{
    public static string ResolveLegacyDeviceId(IConfiguredDeviceRegistry registry)
    {
        if (!registry.IsSingleDevice)
        {
            throw new InvalidOperationException(
                "Legacy device routes require exactly one configured device. Use /api/v1/devices/{deviceId}/…");
        }

        return registry.All[0].DeviceId;
    }

    public static IResult UnknownDevice(UnknownConfiguredDeviceException ex) =>
        Results.NotFound(new { error = "unknown_device", message = ex.Message, deviceId = ex.DeviceId });
}
