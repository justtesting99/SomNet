using System.Text.Json;

namespace SomNet.API.Services;

internal static class HardwareCommandAckTimeout
{
    private static readonly TimeSpan StrokeAbortTimeout = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan AutomaticStartTimeout = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan AutomaticStopTimeout = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan BurstMargin = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan BurstMaxTimeout = TimeSpan.FromSeconds(600);

    public static TimeSpan Resolve(string commandKey, string payloadJson)
    {
        if (string.Equals(commandKey, "burst", StringComparison.OrdinalIgnoreCase))
        {
            return ResolveBurst(payloadJson);
        }

        if (string.Equals(commandKey, "automatic-start", StringComparison.OrdinalIgnoreCase))
        {
            return AutomaticStartTimeout;
        }

        if (string.Equals(commandKey, "automatic-stop", StringComparison.OrdinalIgnoreCase))
        {
            return AutomaticStopTimeout;
        }

        return StrokeAbortTimeout;
    }

    private static TimeSpan ResolveBurst(string payloadJson)
    {
        try
        {
            using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(payloadJson) ? "{}" : payloadJson);
            var root = document.RootElement;

            if (!root.TryGetProperty("burstStrokes", out var strokesElement) ||
                !root.TryGetProperty("strokeMs", out var strokeMsElement) ||
                !root.TryGetProperty("burstDelayMs", out var delayElement))
            {
                return BurstMaxTimeout;
            }

            var burstStrokes = strokesElement.GetInt32();
            var strokeMs = strokeMsElement.GetInt64();
            var burstDelayMs = delayElement.GetInt64();

            if (burstStrokes < 1 || strokeMs < 1)
            {
                return StrokeAbortTimeout;
            }

            var totalMs = burstStrokes * strokeMs;
            if (burstStrokes > 1)
            {
                totalMs += (burstStrokes - 1L) * burstDelayMs;
            }

            var timeout = TimeSpan.FromMilliseconds(totalMs) + BurstMargin;
            return timeout > BurstMaxTimeout ? BurstMaxTimeout : timeout;
        }
        catch (JsonException)
        {
            return StrokeAbortTimeout;
        }
    }
}
