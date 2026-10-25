using System.Text.Json;
using Xunit;
using SomNet.Device.LocalClient;
using SomNet.Shared.DTO.Modes;
using SomNet.Shared.Enums;

namespace SomNet.Device.LocalClient.Tests;

public sealed class AutomaticStartPayloadBuilderTests
{
    [Fact]
    public void BuildJson_omits_running_property()
    {
        var json = AutomaticStartPayloadBuilder.BuildJson(new AutomaticControlStateDto
        {
            Running = true,
            AutomaticMode = AutomaticRunMode.Periodic,
        });

        using var doc = JsonDocument.Parse(json);
        Assert.False(doc.RootElement.TryGetProperty("running", out _));
        Assert.Equal("periodic", doc.RootElement.GetProperty("automaticMode").GetString());
    }
}
