using SomNet.Shared.DTO.Modes;
using SomNet.Shared.Enums;
using SomNet.Shared.Modes;
using System.Text.Json;
using Xunit;

namespace SomNet.API.Tests;

public sealed class MotorAutomaticStartPayloadBuilderTests
{
    [Fact]
    public void BuildJson_includes_actuatorKind_and_segmentTargetRampMs()
    {
        var json = MotorAutomaticStartPayloadBuilder.BuildJson(new MotorAutomaticControlStateDto
        {
            AutomaticMode = AutomaticRunMode.Periodic,
            EndSessionMode = EndSessionMode.Minutes,
            EndSessionValue = 1,
        });

        using var doc = JsonDocument.Parse(json);
        Assert.Equal("hbridge", doc.RootElement.GetProperty("actuatorKind").GetString());
        Assert.True(doc.RootElement.TryGetProperty("segmentTargetRampMs", out _));
        Assert.False(doc.RootElement.TryGetProperty("running", out _));
    }
}
