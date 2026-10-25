using System.Text.Json;
using System.Text.Json.Serialization;
using SomNet.Shared.Serialization;

namespace SomNet.Device.LocalClient;

internal static class LocalClientJson
{
    public static JsonSerializerOptions Options { get; } = CreateOptions();

    private static JsonSerializerOptions CreateOptions()
    {
        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        };

        SomNetJsonOptions.Configure(options);
        return options;
    }
}
