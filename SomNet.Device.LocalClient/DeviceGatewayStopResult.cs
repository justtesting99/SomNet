using SomNet.Shared.DTO.DeviceGateway;

namespace SomNet.Device.LocalClient;

public sealed class DeviceGatewayStopResult
{
    public required int HttpStatusCode { get; init; }

    public AutomaticStopResponseDto? Response { get; init; }

    public string? ErrorBody { get; init; }

    public bool IsSuccess => HttpStatusCode is >= 200 and < 300 && Response is not null;

    public bool IsNoActiveRun =>
        HttpStatusCode == 404
        || string.Equals(Response?.Status, "NoActiveRun", StringComparison.Ordinal);

    public string? DeviceId { get; init; }
}
