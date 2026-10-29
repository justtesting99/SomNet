using System.Text.Json;
using SomNet.Shared.History;

namespace SomNet.API.Services;

/// <summary>
/// One-line captions for action snapshot groups in session history.
/// </summary>
public static class SessionActionSnapshotSummaryBuilder
{
    public static string? BuildForManualAck(string commandKey, string? payloadJson, string? resultJson)
    {
        if (!string.Equals(commandKey, "stroke", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(commandKey, "burst", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        using var payload = ParseObject(payloadJson);
        using var result = ParseObject(resultJson);

        if (string.Equals(commandKey, "stroke", StringComparison.OrdinalIgnoreCase))
        {
            var power = ReadInt(payload, "powerPercent");
            var actualMs = ReadInt(result, "actualStrokeMs") ?? ReadInt(payload, "strokeMs");
            if (power is null)
            {
                return "Manual stroke";
            }

            return actualMs is > 0
                ? $"Manual stroke at {power}% ({actualMs} ms)"
                : $"Manual stroke at {power}%";
        }

        var burstPower = ReadInt(payload, "powerPercent");
        var burstStrokes = ReadInt(result, "strokesCompleted") ?? ReadInt(payload, "burstStrokes");
        var delayMs = ReadInt(payload, "burstDelayMs");
        var delaySec = delayMs is > 0 ? (int)Math.Round(delayMs.Value / 1000.0) : (int?)null;

        if (burstPower is null || burstStrokes is null)
        {
            return "Manual burst";
        }

        return delaySec is > 0
            ? $"Manual burst at {burstPower}% ({burstStrokes} strokes @ {delaySec}s delay)"
            : $"Manual burst at {burstPower}% ({burstStrokes} strokes)";
    }

    public static string? BuildForAutomaticSessionComplete(string? resultJson, string? fallbackReason = null) =>
        AutomaticSessionSummaryBuilder.BuildFromResultJson(resultJson, fallbackReason);

    private static JsonDocument? ParseObject(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            return JsonDocument.Parse(json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static int? ReadInt(JsonDocument? document, string property)
    {
        if (document is null)
        {
            return null;
        }

        if (!document.RootElement.TryGetProperty(property, out var element))
        {
            return null;
        }

        return element.ValueKind switch
        {
            JsonValueKind.Number when element.TryGetInt32(out var value) => value,
            _ => null,
        };
    }

    private static bool? ReadBool(JsonDocument? document, string property)
    {
        if (document is null)
        {
            return null;
        }

        if (!document.RootElement.TryGetProperty(property, out var element))
        {
            return null;
        }

        return element.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => null,
        };
    }

    private static string? ReadString(JsonDocument? document, string property)
    {
        if (document is null)
        {
            return null;
        }

        if (!document.RootElement.TryGetProperty(property, out var element))
        {
            return null;
        }

        return element.ValueKind == JsonValueKind.String ? element.GetString() : null;
    }
}
