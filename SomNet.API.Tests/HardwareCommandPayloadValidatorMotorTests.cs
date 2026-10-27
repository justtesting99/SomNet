using SomNet.API.Services;
using SomNet.Shared.Enums;
using SomNet.Shared.Models;

namespace SomNet.API.Tests;

public sealed class HardwareCommandPayloadValidatorMotorTests
{
    [Fact]
    public void Motor_automatic_start_accepts_periodic_payload()
    {
        const string payload =
            """
            {
              "automaticMode": "periodic",
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
    public void Motor_automatic_start_accepts_random_speed_mode()
    {
        const string payload =
            """
            {
              "automaticMode": "randomSpeed",
              "minimumDutyPercent": 20,
              "maximumDutyPercent": 80,
              "minimumSpeedPercent": 10,
              "maximumSpeedPercent": 90,
              "segmentMinSeconds": 5,
              "segmentMaxSeconds": 20,
              "endSessionMode": "noAutoEnd"
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
    public void Motor_automatic_start_accepts_random_speed_and_timing_mode()
    {
        const string payload =
            """
            {
              "automaticMode": "randomSpeedAndTiming",
              "minimumDutyPercent": 20,
              "maximumDutyPercent": 80,
              "minimumSpeedPercent": 10,
              "maximumSpeedPercent": 90,
              "segmentMinSeconds": 5,
              "segmentMaxSeconds": 20,
              "endSessionMode": "noAutoEnd"
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
    public void Motor_automatic_start_rejects_relay_only_mode()
    {
        const string payload =
            """
            {
              "automaticMode": "randomTimingOnly",
              "minimumDutyPercent": 20,
              "maximumDutyPercent": 80,
              "segmentMinSeconds": 5,
              "segmentMaxSeconds": 20,
              "endSessionMode": "noAutoEnd"
            }
            """;

        var ok = HardwareCommandPayloadValidator.TryValidate(
            HardwareCommandKeys.AutomaticStart,
            payload,
            maxStrokeMs: 400,
            ActuatorKind.Hbridge,
            out var error);

        Assert.False(ok);
        Assert.Contains("motor", error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Motor_automatic_update_accepts_same_payload_as_start()
    {
        const string payload =
            """
            {
              "automaticMode": "periodic",
              "minimumDutyPercent": 20,
              "maximumDutyPercent": 80,
              "segmentMinSeconds": 5,
              "segmentMaxSeconds": 20,
              "endSessionMode": "minutes",
              "endSessionValue": 30
            }
            """;

        var ok = HardwareCommandPayloadValidator.TryValidate(
            HardwareCommandKeys.AutomaticUpdate,
            payload,
            maxStrokeMs: 400,
            ActuatorKind.Hbridge,
            out var error);

        Assert.True(ok);
        Assert.Empty(error);
    }

    [Fact]
    public void Motor_device_rejects_relay_stroke()
    {
        var ok = HardwareCommandPayloadValidator.TryValidate(
            HardwareCommandKeys.DeviceStroke,
            """{"strokeMs":200,"powerPercent":50}""",
            maxStrokeMs: 400,
            ActuatorKind.Hbridge,
            out var error);

        Assert.False(ok);
        Assert.Contains("motor", error, StringComparison.OrdinalIgnoreCase);
    }
}
