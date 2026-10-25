using SomNet.Shared.DTO.DeviceGateway;

namespace SomNet.Device.LocalClient;

public sealed class AutomaticDeviceJobResult
{
    public required AutomaticDeviceJobStatus Status { get; init; }

    public required string Message { get; init; }

    public string? DeviceCorrelationId { get; init; }

    public AutomaticSessionResultDto? Result { get; init; }

    public string? RawResultJson { get; init; }

    /// <summary>SomNet-style history line from <see cref="RawResultJson"/>.</summary>
    public string? Summary { get; init; }

    public DateTimeOffset? StartedAtUtc { get; init; }

    public DateTimeOffset? EndedAtUtc { get; init; }

    public TimeSpan? ObservedDuration =>
        StartedAtUtc is not null && EndedAtUtc is not null
            ? EndedAtUtc - StartedAtUtc
            : null;
}
