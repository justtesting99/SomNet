using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SomNet.Device.LocalClient;
using SomNet.Device.LocalGateway.Middleware;
using SomNet.Shared.DTO.DeviceGateway;
using SomNet.Shared.DTO.Modes;
using SomNet.Shared.Enums;
using Xunit;

namespace SomNet.Device.LocalGateway.Tests;

public sealed class MultiDeviceGatewayWebTests
{
    private const string ApiKey = "SomNet-Dev-Device-Gateway-Key-2026";

    [Fact]
    public async Task List_devices_returns_configured_ids()
    {
        await using var factory = CreateMultiDeviceFactory();
        var client = CreateAuthorizedClient(factory);
        var list = await client.GetFromJsonAsync<List<DeviceGatewayConfiguredDeviceDto>>("/api/v1/devices");
        Assert.NotNull(list);
        Assert.Equal(2, list!.Count);
        Assert.Contains(list, d => d.DeviceId == "esp-a");
        Assert.Contains(list, d => d.DeviceId == "esp-b");
    }

    [Fact]
    public async Task Parallel_runs_on_different_devices_both_complete()
    {
        await using var factory = CreateMultiDeviceFactory();
        var clientA = CreateAuthorizedClient(factory);
        var clientB = CreateAuthorizedClient(factory);
        var request = new AutomaticRunRequestDto
        {
            Parameters = new AutomaticControlStateDto { AutomaticMode = AutomaticRunMode.Periodic },
        };

        var runA = clientA.PostAsJsonAsync("/api/v1/devices/esp-a/automatic/run", request);
        var runB = clientB.PostAsJsonAsync("/api/v1/devices/esp-b/automatic/run", request);

        var responseA = await runA;
        var responseB = await runB;
        responseA.EnsureSuccessStatusCode();
        responseB.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Unknown_device_id_returns_404()
    {
        await using var factory = CreateMultiDeviceFactory();
        var client = CreateAuthorizedClient(factory);
        var response = await client.GetAsync("/api/v1/devices/esp-unknown/status");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private static WebApplicationFactory<Program> CreateMultiDeviceFactory()
    {
        return new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureAppConfiguration((_, config) =>
                {
                    config.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["Device:Devices:0:DeviceId"] = "esp-a",
                        ["Device:Devices:0:BaseUrl"] = "http://esp-a.test",
                        ["Device:Devices:0:Pin"] = "1",
                        ["Device:Devices:1:DeviceId"] = "esp-b",
                        ["Device:Devices:1:BaseUrl"] = "http://esp-b.test",
                        ["Device:Devices:1:Pin"] = "2",
                        ["Device:PollIntervalMs"] = "50",
                    });
                });

                builder.ConfigureServices(services =>
                {
                    LocalGatewayWebTests.WireStubRunner(
                        services,
                        new QuickCompleteJobRunner());
                });
            });
    }

    private static HttpClient CreateAuthorizedClient(WebApplicationFactory<Program> factory)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(GatewayApiKeyMiddleware.ApiKeyHeaderName, ApiKey);
        return client;
    }

    private sealed class QuickCompleteJobRunner : IAutomaticDeviceJobRunner
    {
        public Task<AutomaticDeviceJobResult> RunAutomaticAsync(
            AutomaticControlStateDto parameters,
            AutomaticDeviceJobRunOptions? runOptions = null,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(new AutomaticDeviceJobResult
            {
                Status = AutomaticDeviceJobStatus.Completed,
                Message = "ok",
            });
    }
}
