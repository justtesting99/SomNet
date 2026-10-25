using Microsoft.Extensions.Options;
using SomNet.Device.LocalClient;
using Xunit;

namespace SomNet.Device.LocalClient.Tests;

public sealed class ConfiguredDeviceRegistryTests
{
    [Fact]
    public void Legacy_single_device_uses_default_id_when_device_id_omitted()
    {
        var registry = new ConfiguredDeviceRegistry(Options.Create(new ConfiguredDeviceOptions
        {
            BaseUrl = "http://192.168.1.1",
            Pin = "1234",
        }));

        Assert.True(registry.IsSingleDevice);
        Assert.Equal(ConfiguredDeviceRegistry.LegacyDefaultDeviceId, registry.All[0].DeviceId);
    }

    [Fact]
    public void Devices_array_supports_multiple_entries()
    {
        var registry = new ConfiguredDeviceRegistry(Options.Create(new ConfiguredDeviceOptions
        {
            Devices =
            [
                new ConfiguredDeviceEntryOptions
                {
                    DeviceId = "esp-a",
                    BaseUrl = "http://a",
                    Pin = "1",
                },
                new ConfiguredDeviceEntryOptions
                {
                    DeviceId = "esp-b",
                    BaseUrl = "http://b",
                    Pin = "2",
                },
            ],
        }));

        Assert.False(registry.IsSingleDevice);
        Assert.True(registry.TryGet("esp-b", out var entry));
        Assert.Equal("http://b", entry!.BaseUrl);
    }

    [Fact]
    public void Duplicate_device_ids_throw()
    {
        Assert.Throws<InvalidOperationException>(() =>
            new ConfiguredDeviceRegistry(Options.Create(new ConfiguredDeviceOptions
            {
                Devices =
                [
                    new ConfiguredDeviceEntryOptions { DeviceId = "esp-a", BaseUrl = "http://a" },
                    new ConfiguredDeviceEntryOptions { DeviceId = "esp-a", BaseUrl = "http://b" },
                ],
            })));
    }
}
