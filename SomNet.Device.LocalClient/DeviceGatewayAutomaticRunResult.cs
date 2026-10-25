using SomNet.Shared.DTO.DeviceGateway;

namespace SomNet.Device.LocalClient;

public sealed class DeviceGatewayAutomaticRunResult
{
    public required int HttpStatusCode { get; init; }

    public AutomaticRunResponseDto? Response { get; init; }

    public string? ErrorBody { get; init; }

    /// <summary>Another gateway HTTP request is already running automatic mode (409 concurrent lock).</summary>
    public bool IsGatewayConcurrentRun { get; init; }

    public bool IsSuccess => HttpStatusCode is >= 200 and < 300 && Response is not null;

    public bool IsDeviceUnreachable =>
        HttpStatusCode == 502
        || string.Equals(Response?.Status, nameof(AutomaticDeviceJobStatus.DeviceUnreachable), StringComparison.Ordinal);

    public bool IsFailedPrecondition =>
        string.Equals(Response?.Status, nameof(AutomaticDeviceJobStatus.FailedPrecondition), StringComparison.Ordinal);

    public string? GatewayCorrelationId { get; init; }
}
