namespace SomNet.Device.LocalClient;

public interface IAutomaticDeviceJobRunnerFactory
{
    IAutomaticDeviceJobRunner CreateRunner(string deviceId);
}

public sealed class AutomaticDeviceJobRunnerFactory : IAutomaticDeviceJobRunnerFactory
{
    private readonly ISomEspLocalSessionClientFactory _clientFactory;
    private readonly IConfiguredDeviceRegistry _registry;

    public AutomaticDeviceJobRunnerFactory(
        ISomEspLocalSessionClientFactory clientFactory,
        IConfiguredDeviceRegistry registry)
    {
        _clientFactory = clientFactory;
        _registry = registry;
    }

    public IAutomaticDeviceJobRunner CreateRunner(string deviceId)
    {
        var entry = _registry.GetRequired(deviceId);
        var client = _clientFactory.GetClient(entry.DeviceId);
        var options = Microsoft.Extensions.Options.Options.Create(new SomEspLocalClientOptions
        {
            BaseUrl = entry.BaseUrl,
            Pin = entry.Pin,
            PollIntervalMs = entry.PollIntervalMs,
            HttpTimeout = entry.HttpTimeout,
        });

        return new AutomaticDeviceJobRunner(client, options);
    }
}
