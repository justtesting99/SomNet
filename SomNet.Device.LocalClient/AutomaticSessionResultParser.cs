using System.Text.Json;
using SomNet.Shared.DTO.DeviceGateway;

namespace SomNet.Device.LocalClient;

internal static class AutomaticSessionResultParser
{
    public static AutomaticSessionResultDto? TryParse(string? resultJson)
    {
        if (string.IsNullOrWhiteSpace(resultJson))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<AutomaticSessionResultDto>(resultJson, LocalClientJson.Options);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public static bool IsAutomaticStopResult(AutomaticSessionResultDto? result) =>
        string.Equals(result?.CommandKey, "automatic-stop", StringComparison.OrdinalIgnoreCase);
}
