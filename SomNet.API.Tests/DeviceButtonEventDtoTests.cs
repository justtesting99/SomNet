using System.Text.Json;
using SomNet.Shared.DTO.Devices;
using SomNet.Shared.Models;
using SomNet.Shared.Serialization;

namespace SomNet.API.Tests;

public class DeviceButtonEventDtoTests
{
    [Theory]
    [InlineData("double", DeviceButtonClickType.Double)]
    [InlineData("single", DeviceButtonClickType.Single)]
    public void Deserialize_clickType_string_from_device_hub_payload(string clickType, DeviceButtonClickType expected)
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        SomNetJsonOptions.Configure(options);

        var dto = JsonSerializer.Deserialize<DeviceButtonEventDto>(
            $$"""{"clickType":"{{clickType}}","deviceId":"esp32-test","subTarget":"Slv66"}""",
            options);

        Assert.NotNull(dto);
        Assert.Equal(expected, dto.ClickType);
    }
}
