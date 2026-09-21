using SomNet.Shared.DTO.Devices;

namespace SomNet.API.Services;

public interface IVideoActionSnapshotTrigger
{
    void TryCaptureAfterAckAsync(
        string domTarget,
        string subTarget,
        string commandKey,
        int? snapshotActionIndex = null,
        string? payloadJson = null,
        string? resultJson = null,
        CancellationToken cancellationToken = default);

    void TryCaptureAfterAutomaticSessionCompleteAsync(
        string domTarget,
        string subTarget,
        HardwareCommandAckDto acknowledgement,
        CancellationToken cancellationToken = default);
}
