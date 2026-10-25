using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace SomNet.Device.LocalClient;

public static class ServiceCollectionExtensions
{
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

        return services;
    }
}
