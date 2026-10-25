namespace SomNet.Device.LocalClient.Models;

/// <summary>Device automatic-stop / session-complete <c>resultJson</c> (hub parity).</summary>
public sealed class AutomaticSessionResultDto
{
    public string? CommandKey { get; init; }

    public string? AutomaticMode { get; init; }

    public int? StrokesCompleted { get; init; }

    public int? MainStrokesCompleted { get; init; }

    public int? BurstEventsCompleted { get; init; }

    public int? IntraBurstStrokesCompleted { get; init; }

    public bool? BurstsOn { get; init; }

    public int? DurationMs { get; init; }

    public int? EndSessionMode { get; init; }

    public int? EndSessionValue { get; init; }

    public bool? Interrupted { get; init; }

    public string? EndReason { get; init; }
}
