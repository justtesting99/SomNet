using SomNet.Device.LocalClient.Models;

namespace SomNet.Device.LocalClient;

public interface ISomEspLocalSessionClient
{
    Task<LocalUnlockResponse> UnlockAsync(
        string? pin = null,
        string? newPin = null,
        CancellationToken cancellationToken = default);

    Task LockAsync(CancellationToken cancellationToken = default);

    Task ArmAsync(CancellationToken cancellationToken = default);

    Task DisarmAsync(CancellationToken cancellationToken = default);

    Task<LocalOperateStatus> GetLocalStatusAsync(CancellationToken cancellationToken = default);

    Task<LocalCommandAcceptedResponse> SendCommandAsync(
        string commandKey,
        string payloadJson = "{}",
        CancellationToken cancellationToken = default);
}
