using SomNet.Shared.DTO.Devices;
using SomNet.Shared.Models;

namespace SomNet.API.Tests;

public class HardwareCommandKeysTests
{
    private const string SampleAutomaticResultJson =
        "{\"commandKey\":\"automatic-stop\",\"automaticMode\":\"periodic\"," +
        "\"strokesCompleted\":4,\"durationMs\":20000,\"endReason\":\"manualStop\"}";
    [Theory]
    [InlineData(HardwareCommandKeys.ManualStroke, true)]
    [InlineData(HardwareCommandKeys.ManualBurst, true)]
    [InlineData(HardwareCommandKeys.DeviceStroke, true)]
    [InlineData(HardwareCommandKeys.DeviceBurst, true)]
    [InlineData(HardwareCommandKeys.ManualAbort, false)]
    [InlineData(HardwareCommandKeys.AutomaticStart, false)]
    public void IsManualSnapshotCommand_matches_manual_stroke_and_burst_only(string commandKey, bool expected)
    {
        Assert.Equal(expected, HardwareCommandKeys.IsManualSnapshotCommand(commandKey));
    }

    [Fact]
    public void IsAutomaticSessionEndSnapshotAck_matches_session_complete_summary()
    {
        var acknowledgement = new HardwareCommandAckDto
        {
            CorrelationId = HardwareCommandKeys.AutomaticSessionCompleteCorrelationId,
            Success = true,
            ResultJson = SampleAutomaticResultJson,
        };

        Assert.True(HardwareCommandKeys.IsAutomaticSessionEndSnapshotAck(acknowledgement));
    }

    [Fact]
    public void IsAutomaticSessionEndSnapshotAck_matches_abort_summary_even_when_success_false()
    {
        var acknowledgement = new HardwareCommandAckDto
        {
            CorrelationId = HardwareCommandKeys.AutomaticSessionCompleteCorrelationId,
            Success = false,
            ResultJson =
                "{\"commandKey\":\"automatic-stop\",\"endReason\":\"abort\",\"interrupted\":true}",
        };

        Assert.True(HardwareCommandKeys.IsAutomaticSessionEndSnapshotAck(acknowledgement));
    }

    [Fact]
    public void IsAutomaticSessionEndSnapshotAck_rejects_wrong_correlation_id()
    {
        var acknowledgement = new HardwareCommandAckDto
        {
            CorrelationId = "stroke-123",
            Success = true,
            ResultJson = SampleAutomaticResultJson,
        };

        Assert.False(HardwareCommandKeys.IsAutomaticSessionEndSnapshotAck(acknowledgement));
    }

    [Fact]
    public void IsAutomaticSessionEndSnapshotAck_rejects_error_end_reason()
    {
        var acknowledgement = new HardwareCommandAckDto
        {
            CorrelationId = HardwareCommandKeys.AutomaticSessionCompleteCorrelationId,
            Success = false,
            ResultJson = "{\"commandKey\":\"automatic-stop\",\"endReason\":\"error\"}",
        };

        Assert.False(HardwareCommandKeys.IsAutomaticSessionEndSnapshotAck(acknowledgement));
    }
}
