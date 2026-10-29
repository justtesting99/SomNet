namespace SomNet.Shared.DTO.DeviceGateway;

public sealed class AutomaticStopRequestDto
{
    /// <summary>When true, sends ESP <c>abort</c> instead of cooperative <c>automatic-stop</c>.</summary>
    public bool Abort { get; init; }
}

public sealed class AutomaticStopResponseDto
{
    public required string Status { get; init; }

    public required string Message { get; init; }
}
