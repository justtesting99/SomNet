using System.Text.Json;
using SomNet.API.Configuration;
using SomNet.API.Services;
using SomNet.Shared.DTO.Settings;
using SomNet.Shared.Enums;
using SomNet.Shared.Serialization;

namespace SomNet.API.Data;

public static class PairingSettingsSerializer
{
    private static readonly JsonSerializerOptions JsonOptions = CreateOptions();

    public static string Serialize(PairingSettingsDto settings, StrokeMsLimitsOptions limits) =>
        JsonSerializer.Serialize(Normalize(settings, limits), JsonOptions);

    public static PairingSettingsDto Deserialize(string json, StrokeMsLimitsOptions limits)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return Normalize(PairingSettingsDefaults.Value, limits);
        }

        try
        {
            var settings = JsonSerializer.Deserialize<PairingSettingsDto>(json, JsonOptions);
            return settings is null
                ? Normalize(PairingSettingsDefaults.Value, limits)
                : Normalize(settings, limits);
        }
        catch (JsonException)
        {
            return Normalize(PairingSettingsDefaults.Value, limits);
        }
    }

    public static PairingSettingsDto Normalize(PairingSettingsDto settings, StrokeMsLimitsOptions limits)
    {
        var manual = StrokeMsLimitsNormalizer.NormalizeManual(settings.Manual, limits);
        var automatic = StrokeMsLimitsNormalizer.NormalizeAutomaticStrokeMs(settings.Automatic, limits);
        var (minimumPower, maximumPower) = NormalizeAutomaticPower(
            automatic.MinimumPower,
            automatic.MaximumPower,
            automatic.MinimumStrokeMs,
            automatic.MaximumStrokeMs);

        return new PairingSettingsDto
        {
            AppOptions = settings.AppOptions,
            Manual = manual,
            Automatic = new()
            {
                Running = false,
                AutomaticMode = automatic.AutomaticMode,
                MinimumStrokeMs = automatic.MinimumStrokeMs,
                MaximumStrokeMs = automatic.MaximumStrokeMs,
                MinimumPower = minimumPower,
                MaximumPower = maximumPower,
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
            },
        };
    }

    private static (int MinimumPower, int MaximumPower) NormalizeAutomaticPower(
        int minimumPower,
        int maximumPower,
        int minimumStrokeMs,
        int maximumStrokeMs)
    {
        var minPercent = minimumPower;
        var maxPercent = maximumPower;

        if (minimumPower > 100 || maximumPower > 100)
        {
            minPercent = MsToPercent(minimumPower, minimumStrokeMs, maximumStrokeMs);
            maxPercent = MsToPercent(maximumPower, minimumStrokeMs, maximumStrokeMs);
        }

        minPercent = Math.Clamp(minPercent, 0, 100);
        maxPercent = Math.Clamp(maxPercent, 0, 100);

        if (minPercent > maxPercent)
        {
            (minPercent, maxPercent) = (maxPercent, minPercent);
        }

        return (minPercent, maxPercent);
    }

    private static int MsToPercent(int ms, int minimumMs, int maximumMs)
    {
        var min = Math.Min(minimumMs, maximumMs);
        var max = Math.Max(minimumMs, maximumMs);

        if (max == min)
        {
            return 0;
        }

        var clamped = Math.Clamp(ms, min, max);
        return (int)Math.Round((clamped - min) * 100.0 / (max - min));
    }

    private static JsonSerializerOptions CreateOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        SomNetJsonOptions.Configure(options);
        return options;
    }
}
