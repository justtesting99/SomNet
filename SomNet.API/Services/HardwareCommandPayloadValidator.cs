using System.Text.Json;

namespace SomNet.API.Services;

internal static class HardwareCommandPayloadValidator
{
    private const int MaxBurstStrokes = 100;
    private const long MaxBurstDelayMs = 300_000;

    public static bool TryValidate(
        string commandKey,
        string payloadJson,
        int maxStrokeMs,
        out string errorMessage)
    {
        errorMessage = string.Empty;

        if (string.Equals(commandKey, "stroke", StringComparison.OrdinalIgnoreCase))
        {
            return TryValidateStrokePayload(payloadJson, maxStrokeMs, out errorMessage);
        }

        if (!string.Equals(commandKey, "burst", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return TryValidateBurstPayload(payloadJson, maxStrokeMs, out errorMessage);
    }

    private static bool TryValidateStrokePayload(string payloadJson, int maxStrokeMs, out string errorMessage)
    {
        errorMessage = string.Empty;

        try
        {
            using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(payloadJson) ? "{}" : payloadJson);
            var root = document.RootElement;

            if (!root.TryGetProperty("strokeMs", out var strokeMsElement))
            {
                errorMessage = "Stroke payload requires strokeMs.";
                return false;
            }

            var strokeMs = strokeMsElement.GetInt64();
            if (strokeMs <= 0 || strokeMs > maxStrokeMs)
            {
                errorMessage = $"strokeMs must be between 1 and {maxStrokeMs}.";
                return false;
            }

            if (root.TryGetProperty("powerPercent", out var powerElement))
            {
                var powerPercent = powerElement.GetInt32();
                if (powerPercent < 0 || powerPercent > 100)
                {
                    errorMessage = "powerPercent must be between 0 and 100.";
                    return false;
                }
            }

            return true;
        }
        catch (JsonException)
        {
            errorMessage = "Stroke payloadJson is not valid JSON.";
            return false;
        }
    }

    private static bool TryValidateBurstPayload(string payloadJson, int maxStrokeMs, out string errorMessage)
    {
        errorMessage = string.Empty;

        try
        {
            using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(payloadJson) ? "{}" : payloadJson);
            var root = document.RootElement;

            if (!root.TryGetProperty("strokeMs", out var strokeMsElement) ||
                !root.TryGetProperty("burstStrokes", out var strokesElement) ||
                !root.TryGetProperty("burstDelayMs", out var delayElement))
            {
                errorMessage = "Burst payload requires strokeMs, burstStrokes, and burstDelayMs.";
                return false;
            }

            var strokeMs = strokeMsElement.GetInt64();
            var burstStrokes = strokesElement.GetInt32();
            var burstDelayMs = delayElement.GetInt64();

            if (strokeMs <= 0 || strokeMs > maxStrokeMs)
            {
                errorMessage = $"strokeMs must be between 1 and {maxStrokeMs}.";
                return false;
            }

            if (burstStrokes <= 0 || burstStrokes > MaxBurstStrokes)
            {
                errorMessage = $"burstStrokes must be between 1 and {MaxBurstStrokes}.";
                return false;
            }

            if (burstDelayMs < 0 || burstDelayMs > MaxBurstDelayMs)
            {
                errorMessage = $"burstDelayMs must be between 0 and {MaxBurstDelayMs}.";
                return false;
            }

            if (root.TryGetProperty("powerPercent", out var powerElement))
            {
                var powerPercent = powerElement.GetInt32();
                if (powerPercent < 0 || powerPercent > 100)
                {
                    errorMessage = "powerPercent must be between 0 and 100.";
                    return false;
                }
            }

            return true;
        }
        catch (JsonException)
        {
            errorMessage = "Burst payloadJson is not valid JSON.";
            return false;
        }
    }
}
