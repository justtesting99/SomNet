using SomNet.Shared.DTO.Modes;

namespace SomNet.Device.LocalClient;

public interface IAutomaticDeviceJobRunner
{
    Task<AutomaticDeviceJobResult> RunAutomaticAsync(
        AutomaticControlStateDto parameters,
        AutomaticDeviceJobRunOptions? runOptions = null,
        CancellationToken cancellationToken = default);
}
