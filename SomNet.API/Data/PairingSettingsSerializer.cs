using System.Text.Json;
using SomNet.API.Data.Entities;
using SomNet.Shared.DTO.Settings;
using SomNet.Shared.Enums;
using SomNet.Shared.Serialization;

namespace SomNet.API.Data;

public static class PairingSettingsSerializer
{
    private static readonly JsonSerializerOptions JsonOptions = CreateOptions();

    public static string Serialize(PairingSettingsDto settings) =>
        JsonSerializer.Serialize(Normalize(settings), JsonOptions);

    public static PairingSettingsDto Deserialize(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return PairingSettingsDefaults.Value;
        }

        try
        {
            var settings = JsonSerializer.Deserialize<PairingSettingsDto>(json, JsonOptions);
            return settings is null ? PairingSettingsDefaults.Value : Normalize(settings);
        }
        catch (JsonException)
        {
            return PairingSettingsDefaults.Value;
        }
    }

    public static PairingSettingsDto Normalize(PairingSettingsDto settings)
    {
        var automatic = settings.Automatic;
        var minimumStrokeMs = automatic.MinimumStrokeMs > 0 ? automatic.MinimumStrokeMs : 25;
        var maximumStrokeMs = automatic.MaximumStrokeMs > 0 ? automatic.MaximumStrokeMs : 400;
        var (minimumPower, maximumPower) = NormalizeAutomaticPower(
            automatic.MinimumPower,
            automatic.MaximumPower,
            minimumStrokeMs,
            maximumStrokeMs);

        return new PairingSettingsDto
        {
            AppOptions = settings.AppOptions,
            Manual = settings.Manual,
            Automatic = new()
            {
                Running = false,
                AutomaticMode = automatic.AutomaticMode,
                MinimumStrokeMs = minimumStrokeMs,
                MaximumStrokeMs = maximumStrokeMs,
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
