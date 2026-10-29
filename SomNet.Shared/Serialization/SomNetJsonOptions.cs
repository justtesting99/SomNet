using System.Text.Json;
using System.Text.Json.Serialization;
using SomNet.Shared.Enums;
using SomNet.Shared.Models;

namespace SomNet.Shared.Serialization;

public static class SomNetJsonOptions
{
    public static JsonSerializerOptions Default { get; } = CreateDefault();

    public static JsonSerializerOptions CreateDefault()
    {
        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        };
        Configure(options);
        return options;
    }

    public static void Configure(JsonSerializerOptions options)
    {
        options.Converters.Add(new JsonStringEnumConverter<ConnectionState>(JsonNamingPolicy.CamelCase));
        options.Converters.Add(new JsonStringEnumConverter<OperationMode>(JsonNamingPolicy.CamelCase));
        options.Converters.Add(new JsonStringEnumConverter<EndSessionMode>(JsonNamingPolicy.CamelCase));
        options.Converters.Add(new JsonStringEnumConverter<BurstStyle>(JsonNamingPolicy.CamelCase));
        options.Converters.Add(new JsonStringEnumConverter<BurstPlacement>(JsonNamingPolicy.CamelCase));
        options.Converters.Add(new JsonStringEnumConverter<AutomaticRunMode>(JsonNamingPolicy.CamelCase));
        options.Converters.Add(new JsonStringEnumConverter<VideoExpandMode>(JsonNamingPolicy.CamelCase));
        options.Converters.Add(new JsonStringEnumConverter<ActionSnapshotFeeds>(JsonNamingPolicy.CamelCase));
        options.Converters.Add(new JsonStringEnumConverter<VideoFeedBandwidth>(JsonNamingPolicy.CamelCase));
        options.Converters.Add(new JsonStringEnumConverter<HistoryTimelineEntryType>(JsonNamingPolicy.CamelCase));
        options.Converters.Add(new JsonStringEnumConverter<DeviceButtonClickType>(JsonNamingPolicy.CamelCase));
        options.Converters.Add(new JsonStringEnumConverter<ActuatorKind>(JsonNamingPolicy.CamelCase));
    }
}
