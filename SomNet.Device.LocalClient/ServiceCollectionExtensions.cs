using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using SomNet.Shared.DTO.DeviceGateway;

namespace SomNet.Device.LocalClient;

public static class ServiceCollectionExtensions
{
    public const string SomEspHttpClientFactoryName = "SomEspLocalSession";

    /// <summary>Multi-device pool for <see cref="SomNet.Device.LocalGateway"/> (P7-D2).</summary>
    public static IServiceCollection AddSomEspDevicePool(this IServiceCollection services)
    {
        services.AddOptions<ConfiguredDeviceOptions>()
            .BindConfiguration(ConfiguredDeviceOptions.SectionName);

        services.AddSingleton<IConfiguredDeviceRegistry, ConfiguredDeviceRegistry>();
        services.AddHttpClient(SomEspHttpClientFactoryName);
        services.AddSingleton<ISomEspLocalSessionClientFactory, SomEspLocalSessionClientFactory>();
        services.AddSingleton<IAutomaticDeviceJobRunnerFactory, AutomaticDeviceJobRunnerFactory>();
        return services;
    }

    public static IServiceCollection AddSomEspLocalClient(this IServiceCollection services)
    {
        services.AddOptions<SomEspLocalClientOptions>()
            .BindConfiguration(SomEspLocalClientOptions.SectionName);

        services.AddHttpClient<SomEspLocalClient>((provider, client) =>
        {
            var options = provider.GetRequiredService<IOptions<SomEspLocalClientOptions>>().Value;
            if (!string.IsNullOrWhiteSpace(options.BaseUrl))
            {
                client.BaseAddress = new Uri(options.BaseUrl.TrimEnd('/') + "/");
            }

            client.Timeout = options.HttpTimeout;
        });

        services.AddSingleton<ISomEspLocalSessionClient>(provider =>
            provider.GetRequiredService<SomEspLocalClient>());

        services.AddSingleton<AutomaticDeviceJobRunner>();
        services.AddSingleton<IAutomaticDeviceJobRunner>(provider =>
            provider.GetRequiredService<AutomaticDeviceJobRunner>());

        return services;
    }

    /// <summary>HTTP client for <see cref="SomNet.Device.LocalGateway"/> (main app scheduler path).</summary>
    public static IServiceCollection AddDeviceGatewayClient(this IServiceCollection services)
    {
        services.AddOptions<DeviceGatewayClientOptions>()
            .BindConfiguration(DeviceGatewayClientOptions.SectionName);

        services.AddHttpClient<IDeviceGatewayClient, DeviceGatewayClient>((provider, client) =>
        {
            var options = provider.GetRequiredService<IOptions<DeviceGatewayClientOptions>>().Value;
            if (!string.IsNullOrWhiteSpace(options.BaseUrl))
            {
                client.BaseAddress = new Uri(options.BaseUrl.TrimEnd('/') + "/");
            }

            client.Timeout = options.HttpTimeout;

            if (!string.IsNullOrWhiteSpace(options.ApiKey))
            {
                client.DefaultRequestHeaders.Remove(DeviceGatewayHttp.ApiKeyHeaderName);
                client.DefaultRequestHeaders.Add(DeviceGatewayHttp.ApiKeyHeaderName, options.ApiKey);
            }
        });

        return services;
    }
}
