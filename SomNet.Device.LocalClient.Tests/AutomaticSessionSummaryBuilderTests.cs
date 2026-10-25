using SomNet.Shared.History;
using Xunit;

namespace SomNet.Device.LocalClient.Tests;

public sealed class AutomaticSessionSummaryBuilderTests
{
    [Fact]
    public void BuildFromResultJson_matches_api_golden_case()
    {
        var summary = AutomaticSessionSummaryBuilder.BuildFromResultJson(
            """
            {
              "commandKey": "automatic-stop",
              "automaticMode": "randomPowerAndTiming",
              "mainStrokesCompleted": 4,
              "durationMs": 60000,
              "endReason": "manualStop"
            }
            """);

        Assert.Equal("Random Power and Timing — 4 main strokes over 1 min (stopped manually)", summary);
    }

    [Fact]
    public void BuildFromResultJson_periodic_manual_stop_two_minutes()
    {
        var summary = AutomaticSessionSummaryBuilder.BuildFromResultJson(
            """
            {
              "automaticMode": "periodic",
              "strokesCompleted": 8,
              "durationMs": 120000,
              "endReason": "manualStop"
            }
            """);

        Assert.Equal("Periodic — 8 main strokes over 2 min (stopped manually)", summary);
    }

    [Fact]
    public void BuildFromResultJson_aborted_session()
    {
        var summary = AutomaticSessionSummaryBuilder.BuildFromResultJson(
            """
            {
              "automaticMode": "periodic",
              "strokesCompleted": 4,
              "durationMs": 20000,
              "endReason": "abort",
              "interrupted": true
            }
            """);

        Assert.Equal("Periodic — 4 main strokes over 20 sec (aborted)", summary);
    }

    [Fact]
    public void BuildFromResultJson_bursts_on_includes_burst_events()
    {
        var summary = AutomaticSessionSummaryBuilder.BuildFromResultJson(
            """
            {
              "automaticMode": "periodic",
              "burstsOn": true,
              "mainStrokesCompleted": 8,
              "strokesCompleted": 8,
              "burstEventsCompleted": 4,
              "durationMs": 120000,
              "endReason": "endSession"
            }
            """);

        Assert.Equal(
            "Periodic — 8 main strokes, 4 burst events over 2 min (end session rule)",
            summary);
    }

    [Fact]
    public void BuildFromResultJson_missing_json_uses_fallback_reason()
    {
        var summary = AutomaticSessionSummaryBuilder.BuildFromResultJson(null, "stopped manually");
        Assert.Equal("Automatic session (stopped manually)", summary);
    }
}
