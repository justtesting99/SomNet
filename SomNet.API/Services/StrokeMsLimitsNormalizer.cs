using SomNet.API.Configuration;
using SomNet.Shared.DTO.Modes;

namespace SomNet.API.Services;

public static class StrokeMsLimitsNormalizer
{
    public static (int Minimum, int Maximum) NormalizePair(int minimumStrokeMs, int maximumStrokeMs, StrokeMsLimitsOptions limits)
    {
        var absMin = limits.AbsoluteMinimum;
        var absMax = limits.AbsoluteMaximum;

        if (absMax < absMin)
        {
            (absMin, absMax) = (absMax, absMin);
        }

        var min = minimumStrokeMs > 0 ? minimumStrokeMs : absMin;
        var max = maximumStrokeMs > 0 ? maximumStrokeMs : absMax;

        min = Math.Clamp(min, absMin, absMax);
        max = Math.Clamp(max, absMin, absMax);

        if (min > max)
        {
            min = max;
        }

        return (min, max);
    }

    public static ManualControlStateDto NormalizeManual(ManualControlStateDto manual, StrokeMsLimitsOptions limits)
    {
        var (min, max) = NormalizePair(manual.MinimumStrokeMs, manual.MaximumStrokeMs, limits);
        return new ManualControlStateDto
        {
            MinimumStrokeMs = min,
            MaximumStrokeMs = max,
            PowerPercent = manual.PowerPercent,
            BurstStrokes = manual.BurstStrokes,
            BurstDelaySeconds = manual.BurstDelaySeconds,
        };
    }

    public static AutomaticControlStateDto NormalizeAutomaticStrokeMs(
        AutomaticControlStateDto automatic,
        StrokeMsLimitsOptions limits)
    {
        var (min, max) = NormalizePair(automatic.MinimumStrokeMs, automatic.MaximumStrokeMs, limits);
        return new AutomaticControlStateDto
        {
            Running = automatic.Running,
            AutomaticMode = automatic.AutomaticMode,
            MinimumStrokeMs = min,
            MaximumStrokeMs = max,
            MinimumPower = automatic.MinimumPower,
            MaximumPower = automatic.MaximumPower,
            StrokeMinSeconds = automatic.StrokeMinSeconds,
            StrokeMaxSeconds = automatic.StrokeMaxSeconds,
            DelayBeforeStartSeconds = automatic.DelayBeforeStartSeconds,
            EndSessionValue = automatic.EndSessionValue,
            EndSessionMode = automatic.EndSessionMode,
            BurstsOn = automatic.BurstsOn,
            BurstPercent = automatic.BurstPercent,
            BurstStyle = automatic.BurstStyle,
            BurstStrokePowerMin = automatic.BurstStrokePowerMin,
            BurstStrokePowerMax = automatic.BurstStrokePowerMax,
            BurstDelayMin = automatic.BurstDelayMin,
            BurstDelayMax = automatic.BurstDelayMax,
            BurstStrokesMin = automatic.BurstStrokesMin,
            BurstStrokesMax = automatic.BurstStrokesMax,
        };
    }
}
