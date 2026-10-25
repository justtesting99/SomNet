using System.Collections.Concurrent;

namespace SomNet.Device.LocalClient;

public sealed class SomEspLocalSessionClientFactory : ISomEspLocalSessionClientFactory
{
    private readonly IConfiguredDeviceRegistry _registry;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ConcurrentDictionary<string, ISomEspLocalSessionClient> _clients =
        new(StringComparer.OrdinalIgnoreCase);

    public SomEspLocalSessionClientFactory(
        IConfiguredDeviceRegistry registry,
        IHttpClientFactory httpClientFactory)
    {
        _registry = registry;
        _httpClientFactory = httpClientFactory;
    }

    public ISomEspLocalSessionClient GetClient(string deviceId)
    {
        var entry = _registry.GetRequired(deviceId);
        return _clients.GetOrAdd(
            entry.DeviceId,
            _ => CreateClient(entry));
    }

    private ISomEspLocalSessionClient CreateClient(ResolvedDeviceEntry entry)
    {
        var http = _httpClientFactory.CreateClient(ServiceCollectionExtensions.SomEspHttpClientFactoryName);
        http.BaseAddress = new Uri(entry.BaseUrl.TrimEnd('/') + "/");
        http.Timeout = entry.HttpTimeout;

        var options = Microsoft.Extensions.Options.Options.Create(new SomEspLocalClientOptions
        {
            BaseUrl = entry.BaseUrl,
            Pin = entry.Pin,
            PollIntervalMs = entry.PollIntervalMs,
            HttpTimeout = entry.HttpTimeout,
        });

        return new SomEspLocalClient(http, options);
    }
}
