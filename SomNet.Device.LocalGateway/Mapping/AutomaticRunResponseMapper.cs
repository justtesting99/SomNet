using SomNet.Device.LocalClient;
using SomNet.Shared.DTO.DeviceGateway;

namespace SomNet.Device.LocalGateway.Mapping;

internal static class AutomaticRunResponseMapper
{
    public static AutomaticRunResponseDto ToDto(AutomaticDeviceJobResult job) => new()
    {
        Status = job.Status.ToString(),
        Message = job.Message,
        Summary = job.Summary,
        Result = job.Result,
        StartedAtUtc = job.StartedAtUtc,
        EndedAtUtc = job.EndedAtUtc,
        DeviceCorrelationId = job.DeviceCorrelationId,
    };

    public static int MapToStatusCode(AutomaticDeviceJobStatus status) =>
        status switch
        {
            AutomaticDeviceJobStatus.FailedPrecondition => StatusCodes.Status409Conflict,
            AutomaticDeviceJobStatus.DeviceUnreachable => StatusCodes.Status502BadGateway,
            _ => StatusCodes.Status200OK,
        };
}
