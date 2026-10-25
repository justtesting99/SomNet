using SomNet.Shared.DTO.Modes;

namespace SomNet.Shared.DTO.DeviceGateway;

/// <summary>Per-run audit row for the main application database (doc 28 §4.4).</summary>
public sealed class AutomaticRunJobRecordDto
{
    public string? JobId { get; init; }

    public string? ScheduleId { get; init; }

    public required string Status { get; init; }

    public required string Message { get; init; }

    public string? Summary { get; init; }

    /// <summary>Raw automatic-stop <c>resultJson</c> when available.</summary>
    public string? ResultJson { get; init; }

    public DateTimeOffset? StartedAtUtc { get; init; }

    public DateTimeOffset? EndedAtUtc { get; init; }

    public string? DeviceCorrelationId { get; init; }

    public string? GatewayCorrelationId { get; init; }

    public AutomaticControlStateDto? ParametersSnapshot { get; init; }
}
