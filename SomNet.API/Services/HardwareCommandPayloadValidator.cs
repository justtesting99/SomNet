using System.Text.Json;
using SomNet.Shared.Enums;
using SomNet.Shared.Models;

namespace SomNet.API.Services;

internal static class HardwareCommandPayloadValidator
{
    private const int MaxBurstStrokes = 100;
    private const long MaxBurstDelayMs = 300_000;

    private static readonly HashSet<string> AutomaticRunModes = new(StringComparer.OrdinalIgnoreCase)
    {
        "periodic",
        "randomPowerOnly",
        "randomTimingOnly",
        "randomPowerAndTiming",
        "powerWave",
        "powerAndTimingWave",
        "buildUp",
    };

    private static readonly HashSet<string> MotorAutomaticRunModes = new(StringComparer.OrdinalIgnoreCase)
    {
        "periodic",
        "randomSpeed",
        "randomSpeedAndTiming",
        "powerWave",
        "buildUp",
    };

    private static readonly HashSet<string> WaveAutomaticModes = new(StringComparer.OrdinalIgnoreCase)
    {
        "powerWave",
        "powerAndTimingWave",
        "buildUp",
    };

    private static readonly HashSet<string> EndSessionModes = new(StringComparer.OrdinalIgnoreCase)
    {
        "minutes",
        "strokes",
        "noAutoEnd",
    };

    private static readonly HashSet<string> BurstPlacements = new(StringComparer.OrdinalIgnoreCase)
    {
        "sessionSpread",
        "afterMainStroke",
        "chanceAfterMainStroke",
        "mainPlusSessionSpread",
        "mainPlusAfterMainStroke",
        "mainPlusChanceAfterMainStroke",
        "insteadOfSessionSpread",
        "insteadOfAfterMainStroke",
        "insteadOfChanceAfterMainStroke",
    };

    private static readonly HashSet<string> BurstStyles = new(StringComparer.OrdinalIgnoreCase)
    {
        "fixedPowerDelay",
        "randomPowerOnly",
        "randomDelayOnly",
        "randomPowerAndDelay",
    };

    private const int MaxBurstDelaySec = 300;

    public static bool TryValidate(
        string commandKey,
        string payloadJson,
        int maxStrokeMs,
        ActuatorKind actuatorKind,
        out string errorMessage)
    {
        errorMessage = string.Empty;

        if (actuatorKind == ActuatorKind.Hbridge)
        {
            return TryValidateForMotorProfile(commandKey, payloadJson, out errorMessage);
        }

        if (string.Equals(commandKey, "stroke", StringComparison.OrdinalIgnoreCase))
        {
            return TryValidateStrokePayload(payloadJson, maxStrokeMs, out errorMessage);
        }

        if (string.Equals(commandKey, "burst", StringComparison.OrdinalIgnoreCase))
        {
            return TryValidateBurstPayload(payloadJson, maxStrokeMs, out errorMessage);
        }

        if (string.Equals(commandKey, "automatic-start", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(commandKey, "automatic-update", StringComparison.OrdinalIgnoreCase))
        {
            return TryValidateAutomaticStartPayload(payloadJson, maxStrokeMs, out errorMessage);
        }

        if (string.Equals(commandKey, HardwareCommandKeys.SessionAccessory, StringComparison.OrdinalIgnoreCase))
        {
            return TryValidateSessionAccessoryPayload(payloadJson, out errorMessage);
        }

        if (string.Equals(commandKey, HardwareCommandKeys.SceneSession, StringComparison.OrdinalIgnoreCase))
        {
            return TryValidateSessionAccessoryPayload(payloadJson, out errorMessage);
        }

        return true;
    }

    private static bool TryValidateForMotorProfile(
        string commandKey,
        string payloadJson,
        out string errorMessage)
    {
        errorMessage = string.Empty;

        if (string.Equals(commandKey, HardwareCommandKeys.MotorRun, StringComparison.OrdinalIgnoreCase))
        {
            return TryValidateMotorRunPayload(payloadJson, out errorMessage);
        }

        if (string.Equals(commandKey, HardwareCommandKeys.MotorStop, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (string.Equals(commandKey, HardwareCommandKeys.AutomaticStart, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(commandKey, HardwareCommandKeys.AutomaticStop, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(commandKey, HardwareCommandKeys.AutomaticUpdate, StringComparison.OrdinalIgnoreCase))
        {
            if (string.Equals(commandKey, HardwareCommandKeys.AutomaticStop, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            return TryValidateMotorAutomaticStartPayload(payloadJson, out errorMessage);
        }

        if (string.Equals(commandKey, "stroke", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(commandKey, "burst", StringComparison.OrdinalIgnoreCase))
        {
            errorMessage = "Relay stroke/burst commands are not valid for a motor device.";
            return false;
        }

        if (string.Equals(commandKey, HardwareCommandKeys.SceneSession, StringComparison.OrdinalIgnoreCase))
        {
            return TryValidateSessionAccessoryPayload(payloadJson, out errorMessage);
        }

        return true;
    }

    private static bool TryValidateMotorRunPayload(string payloadJson, out string errorMessage)
    {
        errorMessage = string.Empty;

        try
        {
            using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(payloadJson) ? "{}" : payloadJson);
            var root = document.RootElement;

            if (!root.TryGetProperty("dutyPercent", out var dutyElement))
            {
                errorMessage = "motor-run payload requires dutyPercent.";
                return false;
            }

            var duty = dutyElement.GetInt32();
            if (duty < 0 || duty > 100)
            {
                errorMessage = "dutyPercent must be between 0 and 100.";
                return false;
            }

            if (root.TryGetProperty("durationMs", out var durationElement))
            {
                if (durationElement.ValueKind != JsonValueKind.Number || !durationElement.TryGetInt32(out var durationMs))
                {
                    errorMessage = "durationMs must be a positive integer.";
                    return false;
                }

                if (durationMs < 1 || durationMs > 3_600_000)
                {
                    errorMessage = "durationMs must be between 1 and 3600000.";
                    return false;
                }
            }

            return true;
        }
        catch (JsonException)
        {
            errorMessage = "motor-run payloadJson is not valid JSON.";
            return false;
        }
    }

    private static bool TryValidateMotorAutomaticStartPayload(string payloadJson, out string errorMessage)
    {
        errorMessage = string.Empty;

        try
        {
            using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(payloadJson) ? "{}" : payloadJson);
            var root = document.RootElement;

            if (!root.TryGetProperty("automaticMode", out var modeElement) ||
                modeElement.ValueKind != JsonValueKind.String)
            {
                errorMessage = "Motor automatic-start payload requires automaticMode.";
                return false;
            }

            var automaticMode = modeElement.GetString();
            if (string.IsNullOrWhiteSpace(automaticMode) || !MotorAutomaticRunModes.Contains(automaticMode))
            {
                errorMessage = "automaticMode is not a supported motor automatic program.";
                return false;
            }

            foreach (var propertyName in new[]
                     {
                         "minimumDutyPercent", "maximumDutyPercent", "minimumSpeedPercent", "maximumSpeedPercent",
                         "segmentMinSeconds", "segmentMaxSeconds",
                         "delayBeforeStartSeconds", "endSessionValue", "rampMs",
                     })
            {
                if (root.TryGetProperty(propertyName, out var valueElement) && valueElement.GetInt64() < 0)
                {
                    errorMessage = $"{propertyName} must be zero or greater.";
                    return false;
                }
            }

            if (root.TryGetProperty("segmentTargetRampMs", out var segmentRampElement) &&
                segmentRampElement.TryGetInt32(out var segmentRampMs) &&
                segmentRampMs < -1)
            {
                errorMessage = "segmentTargetRampMs must be -1 or greater.";
                return false;
            }

            if (!TryValidateIntMinMax(
                    root,
                    "minimumDutyPercent",
                    "maximumDutyPercent",
                    0,
                    100,
                    out errorMessage))
            {
                return false;
            }

            if (!TryValidateIntMinMax(
                    root,
                    "minimumSpeedPercent",
                    "maximumSpeedPercent",
                    0,
                    100,
                    out errorMessage))
            {
                return false;
            }

            if (!TryValidateIntMinMax(
                    root,
                    "segmentMinSeconds",
                    "segmentMaxSeconds",
                    1,
                    3600,
                    out errorMessage))
            {
                return false;
            }

            string? endSessionMode = null;
            if (root.TryGetProperty("endSessionMode", out var endSessionModeElement) &&
                endSessionModeElement.ValueKind == JsonValueKind.String)
            {
                endSessionMode = endSessionModeElement.GetString();
                if (!string.Equals(endSessionMode, "minutes", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(endSessionMode, "noAutoEnd", StringComparison.OrdinalIgnoreCase))
                {
                    errorMessage = "Motor endSessionMode must be minutes or noAutoEnd.";
                    return false;
                }
            }

            if (string.Equals(endSessionMode, "minutes", StringComparison.OrdinalIgnoreCase))
            {
                var endSessionValue = root.TryGetProperty("endSessionValue", out var endSessionValueElement)
                    ? endSessionValueElement.GetInt32()
                    : 0;
                if (endSessionValue <= 0)
                {
                    errorMessage = "Motor minutes end session requires endSessionValue greater than zero.";
                    return false;
                }
            }

            if (root.TryGetProperty("burstsOn", out var burstsOnElement) &&
                burstsOnElement.ValueKind == JsonValueKind.True)
            {
                if (!TryValidateAutomaticBurstSettings(root, out errorMessage))
                {
                    return false;
                }
            }

            return true;
        }
        catch (JsonException)
        {
            errorMessage = "Motor automatic-start payloadJson is not valid JSON.";
            return false;
        }
    }

    private static bool TryValidateSessionAccessoryPayload(string payloadJson, out string errorMessage)
    {
        errorMessage = string.Empty;

        try
        {
            using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(payloadJson) ? "{}" : payloadJson);
            var root = document.RootElement;

            if (!root.TryGetProperty("enabled", out var enabledElement) ||
                enabledElement.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            {
                errorMessage = "Session-accessory payload requires enabled (boolean).";
                return false;
            }

            return true;
        }
        catch (JsonException)
        {
            errorMessage = "Session-accessory payloadJson is not valid JSON.";
            return false;
        }
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

    private static bool TryValidateAutomaticStartPayload(
        string payloadJson,
        int maxStrokeMs,
        out string errorMessage)
    {
        errorMessage = string.Empty;

        try
        {
            using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(payloadJson) ? "{}" : payloadJson);
            var root = document.RootElement;

            if (!root.TryGetProperty("automaticMode", out var modeElement) ||
                modeElement.ValueKind != JsonValueKind.String)
            {
                errorMessage = "Automatic-start payload requires automaticMode.";
                return false;
            }

            var automaticMode = modeElement.GetString();
            if (string.IsNullOrWhiteSpace(automaticMode) || !AutomaticRunModes.Contains(automaticMode))
            {
                errorMessage = "automaticMode is not a supported automatic program.";
                return false;
            }

            if (root.TryGetProperty("burstsOn", out var burstsOnElement) &&
                burstsOnElement.ValueKind == JsonValueKind.True)
            {
                if (!TryValidateAutomaticBurstSettings(root, out errorMessage))
                {
                    return false;
                }
            }

            if (root.TryGetProperty("minimumStrokeMs", out var minStrokeElement) &&
                root.TryGetProperty("maximumStrokeMs", out var maxStrokeElement))
            {
                var minimumStrokeMs = minStrokeElement.GetInt64();
                var maximumStrokeMs = maxStrokeElement.GetInt64();

                if (minimumStrokeMs <= 0 || maximumStrokeMs <= 0 ||
                    minimumStrokeMs > maxStrokeMs || maximumStrokeMs > maxStrokeMs)
                {
                    errorMessage = $"minimumStrokeMs and maximumStrokeMs must be between 1 and {maxStrokeMs}.";
                    return false;
                }
            }

            if (root.TryGetProperty("minimumPower", out var minPowerElement))
            {
                var minimumPower = minPowerElement.GetInt32();
                if (minimumPower < 0 || minimumPower > 100)
                {
                    errorMessage = "minimumPower must be between 0 and 100.";
                    return false;
                }
            }

            if (root.TryGetProperty("maximumPower", out var maxPowerElement))
            {
                var maximumPower = maxPowerElement.GetInt32();
                if (maximumPower < 0 || maximumPower > 100)
                {
                    errorMessage = "maximumPower must be between 0 and 100.";
                    return false;
                }
            }

            foreach (var propertyName in new[] { "strokeMinSeconds", "strokeMaxSeconds", "delayBeforeStartSeconds", "endSessionValue" })
            {
                if (root.TryGetProperty(propertyName, out var valueElement) && valueElement.GetInt64() < 0)
                {
                    errorMessage = $"{propertyName} must be zero or greater.";
                    return false;
                }
            }

            string? endSessionMode = null;
            if (root.TryGetProperty("endSessionMode", out var endSessionModeElement) &&
                endSessionModeElement.ValueKind == JsonValueKind.String)
            {
                endSessionMode = endSessionModeElement.GetString();
                if (string.IsNullOrWhiteSpace(endSessionMode) || !EndSessionModes.Contains(endSessionMode))
                {
                    errorMessage = "endSessionMode must be minutes, strokes, or noAutoEnd.";
                    return false;
                }
            }

            var endSessionValue = root.TryGetProperty("endSessionValue", out var endSessionValueElement)
                ? endSessionValueElement.GetInt32()
                : 0;

            if (WaveAutomaticModes.Contains(automaticMode))
            {
                if (!string.Equals(endSessionMode, "minutes", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(endSessionMode, "strokes", StringComparison.OrdinalIgnoreCase))
                {
                    errorMessage = "Wave and build-up modes require endSessionMode minutes or strokes.";
                    return false;
                }

                if (endSessionValue <= 0)
                {
                    errorMessage = "Wave and build-up modes require endSessionValue greater than zero.";
                    return false;
                }
            }

            return true;
        }
        catch (JsonException)
        {
            errorMessage = "Automatic-start payloadJson is not valid JSON.";
            return false;
        }
    }

    private static bool TryValidateAutomaticBurstSettings(JsonElement root, out string errorMessage)
    {
        errorMessage = string.Empty;

        var burstPercent = root.TryGetProperty("burstPercent", out var percentElement)
            ? percentElement.GetInt32()
            : 10;

        if (burstPercent < 0 || burstPercent > 100)
        {
            errorMessage = "burstPercent must be between 0 and 100.";
            return false;
        }

        if (root.TryGetProperty("burstPlacement", out var placementElement) &&
            placementElement.ValueKind == JsonValueKind.String)
        {
            var burstPlacement = placementElement.GetString();
            if (string.IsNullOrWhiteSpace(burstPlacement) || !BurstPlacements.Contains(burstPlacement))
            {
                errorMessage =
                    "burstPlacement must be a supported sessionSpread / afterMainStroke / chanceAfterMainStroke value (mainPlus or insteadOf variants).";
                return false;
            }
        }

        if (root.TryGetProperty("burstStyle", out var styleElement) &&
            styleElement.ValueKind == JsonValueKind.String)
        {
            var burstStyle = styleElement.GetString();
            if (string.IsNullOrWhiteSpace(burstStyle) || !BurstStyles.Contains(burstStyle))
            {
                errorMessage =
                    "burstStyle must be fixedPowerDelay, randomPowerOnly, randomDelayOnly, or randomPowerAndDelay.";
                return false;
            }
        }

        if (!TryValidatePercentMinMax(
                root,
                "burstStrokePowerMin",
                "burstStrokePowerMax",
                0,
                100,
                out errorMessage))
        {
            return false;
        }

        if (!TryValidateIntMinMax(
                root,
                "burstDelayMin",
                "burstDelayMax",
                0,
                MaxBurstDelaySec,
                out errorMessage))
        {
            return false;
        }

        if (!TryValidateIntMinMax(
                root,
                "burstStrokesMin",
                "burstStrokesMax",
                1,
                MaxBurstStrokes,
                out errorMessage))
        {
            return false;
        }

        return true;
    }

    private static bool TryValidatePercentMinMax(
        JsonElement root,
        string minProperty,
        string maxProperty,
        int minLimit,
        int maxLimit,
        out string errorMessage)
    {
        return TryValidateIntMinMax(root, minProperty, maxProperty, minLimit, maxLimit, out errorMessage);
    }

    private static bool TryValidateIntMinMax(
        JsonElement root,
        string minProperty,
        string maxProperty,
        int minLimit,
        int maxLimit,
        out string errorMessage)
    {
        errorMessage = string.Empty;

        if (root.TryGetProperty(minProperty, out var minElement))
        {
            var minValue = minElement.GetInt32();
            if (minValue < minLimit || minValue > maxLimit)
            {
                errorMessage = $"{minProperty} must be between {minLimit} and {maxLimit}.";
                return false;
            }
        }

        if (root.TryGetProperty(maxProperty, out var maxElement))
        {
            var maxValue = maxElement.GetInt32();
            if (maxValue < minLimit || maxValue > maxLimit)
            {
                errorMessage = $"{maxProperty} must be between {minLimit} and {maxLimit}.";
                return false;
            }
        }

        if (root.TryGetProperty(minProperty, out minElement) &&
            root.TryGetProperty(maxProperty, out maxElement) &&
            minElement.GetInt32() > maxElement.GetInt32())
        {
            errorMessage = $"{minProperty} must be less than or equal to {maxProperty}.";
            return false;
        }

        return true;
    }
}
