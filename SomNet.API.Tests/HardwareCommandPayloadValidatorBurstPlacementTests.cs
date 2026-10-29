using SomNet.API.Services;
using SomNet.Shared.Enums;
using SomNet.Shared.Models;

namespace SomNet.API.Tests;

public sealed class HardwareCommandPayloadValidatorBurstPlacementTests
{
    private const string BurstBase =
        """
        {
          "automaticMode": "periodic",
          "burstsOn": true,
          "burstPercent": 50,
          "burstStyle": "fixedPowerDelay",
          "burstStrokePowerMin": 1,
          "burstStrokePowerMax": 100,
          "burstDelayMin": 0,
          "burstDelayMax": 1,
          "burstStrokesMin": 1,
          "burstStrokesMax": 3,
          "endSessionMode": "minutes",
          "endSessionValue": 10
        }
        """;

    [Theory]
    [InlineData("sessionSpread")]
    [InlineData("mainPlusSessionSpread")]
    [InlineData("insteadOfAfterMainStroke")]
    [InlineData("chanceAfterMainStroke")]
    public void Relay_automatic_start_accepts_burst_placement_when_bursts_on(string burstPlacement)
    {
        var payload = BurstBase.Replace(
            "\"burstPercent\": 50",
            $"\"burstPercent\": 50, \"burstPlacement\": \"{burstPlacement}\"");

        var ok = HardwareCommandPayloadValidator.TryValidate(
            HardwareCommandKeys.AutomaticStart,
            payload,
            maxStrokeMs: 400,
            ActuatorKind.Relay,
            out var error);

        Assert.True(ok);
        Assert.Empty(error);
    }

    [Fact]
    public void Relay_automatic_start_rejects_unknown_burst_placement_when_bursts_on()
    {
        var payload = BurstBase.Replace(
            "\"burstPercent\": 50",
            "\"burstPercent\": 50, \"burstPlacement\": \"evenlyAcrossTime\"");

        var ok = HardwareCommandPayloadValidator.TryValidate(
            HardwareCommandKeys.AutomaticStart,
            payload,
            maxStrokeMs: 400,
            ActuatorKind.Relay,
            out var error);

        Assert.False(ok);
        Assert.Contains("burstPlacement", error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Relay_automatic_start_ignores_burst_placement_when_bursts_off()
    {
        const string payload =
            """
            {
              "automaticMode": "periodic",
              "burstsOn": false,
              "burstPlacement": "not-a-real-placement",
              "endSessionMode": "minutes",
              "endSessionValue": 10
            }
            """;

        var ok = HardwareCommandPayloadValidator.TryValidate(
            HardwareCommandKeys.AutomaticStart,
            payload,
            maxStrokeMs: 400,
            ActuatorKind.Relay,
            out var error);

        Assert.True(ok);
        Assert.Empty(error);
    }

    [Fact]
    public void Motor_automatic_start_accepts_burst_placement_when_bursts_on()
    {
        const string payload =
            """
            {
              "automaticMode": "periodic",
              "burstsOn": true,
              "burstPlacement": "chanceAfterMainStroke",
              "burstPercent": 25,
              "burstStyle": "fixedPowerDelay",
              "burstStrokePowerMin": 10,
              "burstStrokePowerMax": 80,
              "burstDelayMin": 0,
              "burstDelayMax": 2,
              "burstStrokesMin": 1,
              "burstStrokesMax": 5,
              "minimumDutyPercent": 20,
              "maximumDutyPercent": 80,
              "segmentMinSeconds": 5,
              "segmentMaxSeconds": 20,
              "endSessionMode": "minutes",
              "endSessionValue": 30
            }
            """;

        var ok = HardwareCommandPayloadValidator.TryValidate(
            HardwareCommandKeys.AutomaticStart,
            payload,
            maxStrokeMs: 400,
            ActuatorKind.Hbridge,
            out var error);

        Assert.True(ok);
        Assert.Empty(error);
    }

    [Fact]
    public void Motor_automatic_start_rejects_unknown_burst_placement_when_bursts_on()
    {
        const string payload =
            """
            {
              "automaticMode": "periodic",
              "burstsOn": true,
              "burstPlacement": "legacySpread",
              "burstPercent": 25,
              "burstStyle": "fixedPowerDelay",
              "burstStrokePowerMin": 10,
              "burstStrokePowerMax": 80,
              "burstDelayMin": 0,
              "burstDelayMax": 2,
              "burstStrokesMin": 1,
              "burstStrokesMax": 5,
              "minimumDutyPercent": 20,
              "maximumDutyPercent": 80,
              "segmentMinSeconds": 5,
              "segmentMaxSeconds": 20,
              "endSessionMode": "minutes",
              "endSessionValue": 30
            }
            """;

        var ok = HardwareCommandPayloadValidator.TryValidate(
            HardwareCommandKeys.AutomaticStart,
            payload,
            maxStrokeMs: 400,
            ActuatorKind.Hbridge,
            out var error);

        Assert.False(ok);
        Assert.Contains("burstPlacement", error, StringComparison.OrdinalIgnoreCase);
    }
}
