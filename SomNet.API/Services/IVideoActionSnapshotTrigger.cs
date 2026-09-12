namespace SomNet.API.Services;

public interface IVideoActionSnapshotTrigger
{
    void TryCaptureAfterAckAsync(
        string domTarget,
        string subTarget,
        string commandKey,
        int? snapshotActionIndex = null,
        CancellationToken cancellationToken = default);
}
