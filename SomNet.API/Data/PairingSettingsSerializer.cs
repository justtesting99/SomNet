using System.Text.Json;
using SomNet.API.Configuration;
using SomNet.API.Services;
using SomNet.Shared.DTO.Modes;
using SomNet.Shared.DTO.Options;
using SomNet.Shared.DTO.Settings;
using SomNet.Shared.Enums;
using SomNet.Shared.Serialization;

namespace SomNet.API.Data;

public static class PairingSettingsSerializer
{
    private static readonly JsonSerializerOptions JsonOptions = CreateOptions();

    public static string Serialize(PairingSettingsDto settings, StrokeMsLimitsOptions limits) =>
        JsonSerializer.Serialize(Normalize(settings, limits), JsonOptions);

    public static PairingSettingsDto Deserialize(string json, StrokeMsLimitsOptions limits)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return Normalize(PairingSettingsDefaults.Value, limits);
        }

        try
        {
            var settings = JsonSerializer.Deserialize<PairingSettingsDto>(json, JsonOptions);
            return settings is null
                ? Normalize(PairingSettingsDefaults.Value, limits)
                : Normalize(settings, limits);
        }
        catch (JsonException)
        {
            return Normalize(PairingSettingsDefaults.Value, limits);
        }
    }

    public static PairingSettingsDto Normalize(PairingSettingsDto settings, StrokeMsLimitsOptions limits)
    {
        var manual = StrokeMsLimitsNormalizer.NormalizeManual(settings.Manual, limits);
        var automatic = StrokeMsLimitsNormalizer.NormalizeAutomaticStrokeMs(settings.Automatic, limits);
        var (minimumPower, maximumPower) = NormalizeAutomaticPower(
            automatic.MinimumPower,
            automatic.MaximumPower,
            automatic.MinimumStrokeMs,
            automatic.MaximumStrokeMs);

        return new PairingSettingsDto
        {
            AppOptions = NormalizeAppOptions(settings.AppOptions),
            Video = NormalizeVideo(settings.Video),
            Manual = manual,
            MotorAutomatic = NormalizeMotorAutomatic(settings.MotorAutomatic),
            Automatic = new()
            {
                Running = false,
                AutomaticMode = automatic.AutomaticMode,
                MinimumStrokeMs = automatic.MinimumStrokeMs,
                MaximumStrokeMs = automatic.MaximumStrokeMs,
                MinimumPower = minimumPower,
                MaximumPower = maximumPower,
                StrokeMinSeconds = automatic.StrokeMinSeconds,
                StrokeMaxSeconds = automatic.StrokeMaxSeconds,
                DelayBeforeStartSeconds = automatic.DelayBeforeStartSeconds,
                EndSessionValue = automatic.EndSessionValue,
                EndSessionMode = automatic.EndSessionMode,
                BurstsOn = automatic.BurstsOn,
                BurstPercent = automatic.BurstPercent,
                BurstStyle = automatic.BurstStyle,
                BurstStrokePowerMin = automatic.BurstStrokePowerMin,
                BurstStrokePowerMax = automatic.BurstStrokePowerMax,
                BurstDelayMin = automatic.BurstDelayMin,
                BurstDelayMax = automatic.BurstDelayMax,
                BurstStrokesMin = automatic.BurstStrokesMin,
                BurstStrokesMax = automatic.BurstStrokesMax,
            },
        };
    }

    private static (int MinimumPower, int MaximumPower) NormalizeAutomaticPower(
        int minimumPower,
        int maximumPower,
        int minimumStrokeMs,
        int maximumStrokeMs)
    {
        var minPercent = minimumPower;
        var maxPercent = maximumPower;

        if (minimumPower > 100 || maximumPower > 100)
        {
            minPercent = MsToPercent(minimumPower, minimumStrokeMs, maximumStrokeMs);
            maxPercent = MsToPercent(maximumPower, minimumStrokeMs, maximumStrokeMs);
        }

        minPercent = Math.Clamp(minPercent, 0, 100);
        maxPercent = Math.Clamp(maxPercent, 0, 100);

        if (minPercent > maxPercent)
        {
            (minPercent, maxPercent) = (maxPercent, minPercent);
        }

        return (minPercent, maxPercent);
    }

    private static int MsToPercent(int ms, int minimumMs, int maximumMs)
    {
        var min = Math.Min(minimumMs, maximumMs);
        var max = Math.Max(minimumMs, maximumMs);

        if (max == min)
        {
            return 0;
        }

        var clamped = Math.Clamp(ms, min, max);
        return (int)Math.Round((clamped - min) * 100.0 / (max - min));
    }

    private static AppOptionsDto NormalizeAppOptions(AppOptionsDto? options)
    {
        var source = options ?? AppOptionsDefaults.Value;
        var timeout = source.VideoFeedTimeoutSeconds;
        if (timeout <= 0)
        {
            timeout = AppOptionsDefaults.Value.VideoFeedTimeoutSeconds;
        }

        return new AppOptionsDto
        {
            EnableSoundAlerts = source.EnableSoundAlerts,
            ConfirmBeforeCommands = source.ConfirmBeforeCommands,
            AllowAutomaticModeOverrides = source.AllowAutomaticModeOverrides,
            AutoExpandVideoOnMobile = source.AutoExpandVideoOnMobile,
            MobileVideoExpandDefault = source.MobileVideoExpandDefault,
            ShowSessionTimestamps = source.ShowSessionTimestamps,
            ShowActiveSessionIdInHeader = source.ShowActiveSessionIdInHeader,
            OperatorDisplayName = source.OperatorDisplayName?.Trim() ?? string.Empty,
            DefaultNotesPrefix = string.IsNullOrWhiteSpace(source.DefaultNotesPrefix)
                ? AppOptionsDefaults.Value.DefaultNotesPrefix
                : source.DefaultNotesPrefix.Trim(),
            ReconnectIntervalSeconds = Math.Clamp(source.ReconnectIntervalSeconds, 5, 120),
            VideoFeedTimeoutSeconds = Math.Clamp(timeout, 5, 600),
            ActionSnapshotFeeds = Enum.IsDefined(source.ActionSnapshotFeeds)
                ? source.ActionSnapshotFeeds
                : ActionSnapshotFeeds.Both,
            VideoFeedBandwidth = Enum.IsDefined(source.VideoFeedBandwidth)
                ? source.VideoFeedBandwidth
                : VideoFeedBandwidth.High,
        };
    }

    private static MotorAutomaticControlStateDto NormalizeMotorAutomatic(MotorAutomaticControlStateDto? motor)
    {
        var source = motor ?? ControlStateDefaults.MotorAutomatic;
        var minDuty = Math.Clamp(source.MinimumDutyPercent, 0, 100);
        var maxDuty = Math.Clamp(source.MaximumDutyPercent, 0, 100);
        if (minDuty > maxDuty)
        {
            (minDuty, maxDuty) = (maxDuty, minDuty);
        }

        var segmentMin = Math.Clamp(source.SegmentMinSeconds, 1, 3600);
        var segmentMax = Math.Clamp(source.SegmentMaxSeconds, 1, 3600);
        if (segmentMin > segmentMax)
        {
            (segmentMin, segmentMax) = (segmentMax, segmentMin);
        }

        var endMode = source.EndSessionMode;
        if (endMode is not EndSessionMode.Minutes and not EndSessionMode.NoAutoEnd)
        {
            endMode = EndSessionMode.NoAutoEnd;
        }

        var endValue = Math.Clamp(source.EndSessionValue, 1, 1440);
        if (endMode == EndSessionMode.NoAutoEnd)
        {
            endValue = Math.Max(1, source.EndSessionValue);
        }

        return new MotorAutomaticControlStateDto
        {
            Running = false,
            AutomaticMode = string.IsNullOrWhiteSpace(source.AutomaticMode) ? "periodic" : source.AutomaticMode.Trim(),
            MinimumDutyPercent = minDuty,
            MaximumDutyPercent = maxDuty,
            SegmentMinSeconds = segmentMin,
            SegmentMaxSeconds = segmentMax,
            DelayBeforeStartSeconds = Math.Clamp(source.DelayBeforeStartSeconds, 0, 3600),
            RampMs = Math.Clamp(source.RampMs, 0, 30_000),
            EndSessionMode = endMode,
            EndSessionValue = endValue,
            ActuatorKind = ActuatorKind.Hbridge,
        };
    }

    private static VideoSettingsDto NormalizeVideo(VideoSettingsDto? video)
    {
        var tunnelBaseUrl = video?.TunnelBaseUrl?.Trim() ?? string.Empty;
        return new VideoSettingsDto
        {
            TunnelBaseUrl = tunnelBaseUrl,
        };
    }

    private static JsonSerializerOptions CreateOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        SomNetJsonOptions.Configure(options);
        return options;
    }
}
