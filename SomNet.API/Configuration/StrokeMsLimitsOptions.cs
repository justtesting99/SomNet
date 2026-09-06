namespace SomNet.API.Configuration;

/// <summary>
/// Absolute bounds for Minimum/Maximum Stroke (ms) edit fields in the SomNet UI.
/// User-selected min/max must stay within these limits and min &lt;= max.
/// </summary>
public sealed class StrokeMsLimitsOptions
{
    public const string SectionName = "Hardware:StrokeMs";

    public int AbsoluteMinimum { get; set; } = 25;

    public int AbsoluteMaximum { get; set; } = 30000;
}
