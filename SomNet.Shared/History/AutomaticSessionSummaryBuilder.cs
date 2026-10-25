using System.Text.Json;

namespace SomNet.Shared.History;

/// <summary>
/// SomNet-style one-line automatic session summaries (from device <c>resultJson</c>).
/// </summary>
public static class AutomaticSessionSummaryBuilder
{
    private static readonly Dictionary<string, string> AutomaticModeLabels = new(StringComparer.OrdinalIgnoreCase)
    {
        ["periodic"] = "Periodic",
        ["randomPowerOnly"] = "Random Power Only",
        ["randomTimingOnly"] = "Random Timing Only",
        ["randomPowerAndTiming"] = "Random Power and Timing",
        ["powerWave"] = "Power Wave",
        ["powerAndTimingWave"] = "Power and Timing Wave",
        ["buildUp"] = "Build-Up",
    };

    public static string BuildFromResultJson(string? resultJson, string? fallbackReason = null)
    {
        using var result = ParseObject(resultJson);
        if (result is null)
        {
            var reason = string.IsNullOrWhiteSpace(fallbackReason) ? "ended" : fallbackReason.Trim();
            return $"Automatic session ({reason})";
        }

        var modeKey = ReadString(result, "automaticMode");
        var modeLabel = modeKey is not null && AutomaticModeLabels.TryGetValue(modeKey, out var label)
            ? label
            : (modeKey ?? "Automatic");

        var mainStrokes = ReadInt(result, "mainStrokesCompleted") ?? ReadInt(result, "strokesCompleted");
        var burstEvents = ReadInt(result, "burstEventsCompleted");
        var burstsOn = ReadBool(result, "burstsOn");
        var durationMs = ReadInt(result, "durationMs");
        var endReason = ReadString(result, "endReason");
        var interrupted = ReadBool(result, "interrupted") == true;

        var detailParts = new List<string>();
        if (mainStrokes is >= 0)
        {
            detailParts.Add($"{mainStrokes} main stroke{(mainStrokes == 1 ? "" : "s")}");
        }

        if (burstsOn == true && burstEvents is > 0)
        {
            detailParts.Add($"{burstEvents} burst event{(burstEvents == 1 ? "" : "s")}");
        }

        var countLabel = string.Join(", ", detailParts);
        var durationLabel = FormatDuration(durationMs);
        var endLabel = FormatAutomaticEndReason(endReason, interrupted);

        var detail = countLabel.Length > 0
            ? durationLabel is not null
                ? $" — {countLabel} over {durationLabel}"
                : $" — {countLabel}"
            : durationLabel is not null
                ? $" — over {durationLabel}"
                : string.Empty;

        return $"{modeLabel}{detail} ({endLabel})";
    }

    private static string FormatAutomaticEndReason(string? endReason, bool interrupted)
    {
        if (interrupted && string.Equals(endReason, "abort", StringComparison.OrdinalIgnoreCase))
        {
            return "aborted";
        }

        return endReason?.Trim().ToLowerInvariant() switch
        {
            "manualstop" => "stopped manually",
            "endsession" => "end session rule",
            "abort" => "aborted",
            "error" => "device error",
            "session-accessory-off" => "session released",
            null or "" => "ended",
            _ => endReason.Trim(),
        };
    }

    private static string? FormatDuration(int? durationMs)
    {
        if (durationMs is null or < 0)
        {
            return null;
        }

        if (durationMs < 60_000)
        {
            var seconds = Math.Max(1, (int)Math.Round(durationMs.Value / 1000.0));
            return $"{seconds} sec";
        }

        var minutes = Math.Max(1, (int)Math.Round(durationMs.Value / 60_000.0));
        return $"{minutes} min";
    }

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
