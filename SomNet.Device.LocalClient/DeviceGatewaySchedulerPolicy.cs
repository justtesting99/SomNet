namespace SomNet.Device.LocalClient;

public enum DeviceGatewaySchedulerDisposition
{
    /// <summary>Run finished (success or terminal failure); persist and continue schedule.</summary>
    Complete,

    /// <summary>Device or gateway busy — do not retry until the next scheduled fire.</summary>
    SkipUntilNextSchedule,

    /// <summary>ESP/gateway unreachable — apply exponential backoff before retry.</summary>
    Backoff,

    /// <summary>401/403 or misconfiguration — alert operator; do not spin.</summary>
    FailConfiguration,
}

public static class DeviceGatewaySchedulerPolicy
{
    public static DeviceGatewaySchedulerDisposition GetDisposition(DeviceGatewayAutomaticRunResult result)
    {
        if (result.IsGatewayConcurrentRun || result.IsFailedPrecondition)
        {
            return DeviceGatewaySchedulerDisposition.SkipUntilNextSchedule;
        }

        if (result.HttpStatusCode is 401 or 403)
        {
            return DeviceGatewaySchedulerDisposition.FailConfiguration;
        }

        if (result.IsDeviceUnreachable)
        {
            return DeviceGatewaySchedulerDisposition.Backoff;
        }

        return DeviceGatewaySchedulerDisposition.Complete;
    }

    /// <summary>Backoff after <see cref="AutomaticDeviceJobStatus.DeviceUnreachable"/> (doc 29 Phase 6).</summary>
    public static TimeSpan GetUnreachableBackoff(int consecutiveUnreachableRuns, TimeSpan? baseDelay = null)
    {
        if (consecutiveUnreachableRuns < 1)
        {
            consecutiveUnreachableRuns = 1;
        }

        baseDelay ??= TimeSpan.FromMinutes(5);
        var multiplier = Math.Min(consecutiveUnreachableRuns, 12);
        var delay = TimeSpan.FromTicks(baseDelay.Value.Ticks * multiplier);
        var cap = TimeSpan.FromHours(1);
        return delay > cap ? cap : delay;
    }
}
