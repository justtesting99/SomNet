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
        return new PairingSettingsDto
        {
            AppOptions = settings.AppOptions,
            Manual = settings.Manual,
            Automatic = new()
            {
                Running = false,
                AutomaticMode = automatic.AutomaticMode,
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
            },
        };
    }

    private static JsonSerializerOptions CreateOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        SomNetJsonOptions.Configure(options);
        return options;
    }
}
