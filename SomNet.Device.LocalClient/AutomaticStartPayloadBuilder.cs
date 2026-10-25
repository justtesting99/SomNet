using System.Text.Json;
using System.Text.Json.Nodes;
using SomNet.Shared.DTO.Modes;

namespace SomNet.Device.LocalClient;

internal static class AutomaticStartPayloadBuilder
{
    public static string BuildJson(AutomaticControlStateDto parameters)
    {
        var node = JsonSerializer.SerializeToNode(parameters, LocalClientJson.Options) as JsonObject
            ?? throw new InvalidOperationException("Failed to serialize automatic parameters.");

        node.Remove("running");
        return node.ToJsonString(LocalClientJson.Options);
    }
}
