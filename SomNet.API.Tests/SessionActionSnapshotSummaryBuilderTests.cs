using SomNet.API.Services;

namespace SomNet.API.Tests;

public class SessionActionSnapshotSummaryBuilderTests
{
    [Fact]
    public void BuildForManualAck_stroke_includes_power_and_actual_ms()
    {
        var summary = SessionActionSnapshotSummaryBuilder.BuildForManualAck(
            "stroke",
            """{"powerPercent":60,"strokeMs":500}""",
            """{"actualStrokeMs":480}""");

        Assert.Equal("Manual stroke at 60% (480 ms)", summary);
    }

    [Fact]
    public void BuildForAutomaticSessionComplete_uses_mode_and_stroke_count()
    {
        var summary = SessionActionSnapshotSummaryBuilder.BuildForAutomaticSessionComplete(
            """
            {
              "commandKey": "automatic-stop",
              "automaticMode": "randomPowerAndTiming",
              "mainStrokesCompleted": 4,
              "durationMs": 45000,
              "endReason": "manualStop"
            }
            """);

        Assert.Equal("Random Power and Timing — 4 main strokes over 1 min (stopped manually)", summary);
    }
}
