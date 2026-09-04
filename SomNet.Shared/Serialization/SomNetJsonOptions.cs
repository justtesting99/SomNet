using System.Text.Json;
using System.Text.Json.Serialization;
using SomNet.Shared.Enums;

namespace SomNet.Shared.Serialization;

public static class SomNetJsonOptions
{
    public static void Configure(JsonSerializerOptions options)
    {
        options.Converters.Add(new JsonStringEnumConverter<ConnectionState>(JsonNamingPolicy.CamelCase));
        options.Converters.Add(new JsonStringEnumConverter<OperationMode>(JsonNamingPolicy.CamelCase));
        options.Converters.Add(new JsonStringEnumConverter<EndSessionMode>(JsonNamingPolicy.CamelCase));
        options.Converters.Add(new JsonStringEnumConverter<BurstStyle>(JsonNamingPolicy.CamelCase));
        options.Converters.Add(new JsonStringEnumConverter<AutomaticRunMode>(JsonNamingPolicy.CamelCase));
        options.Converters.Add(new JsonStringEnumConverter<VideoExpandMode>(JsonNamingPolicy.CamelCase));
        options.Converters.Add(new JsonStringEnumConverter<HistoryTimelineEntryType>(JsonNamingPolicy.CamelCase));
    }
}
