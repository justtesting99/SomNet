using SomNet.Shared.DTO.Devices;

namespace SomNet.API.Services;

public interface IVideoActionSnapshotTrigger
{
    void TryCaptureAfterAckAsync(
        string domTarget,
        string subTarget,
        string commandKey,
        int? snapshotActionIndex = null,
        CancellationToken cancellationToken = default);

    void TryCaptureAfterAutomaticSessionCompleteAsync(
        string domTarget,
        string subTarget,
        HardwareCommandAckDto acknowledgement,
        CancellationToken cancellationToken = default);
}
