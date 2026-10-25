using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SomNet.Device.LocalClient;
using SomNet.Device.LocalClient.Models;
using SomNet.Device.LocalGateway.Middleware;
using SomNet.Shared.DTO.DeviceGateway;
using SomNet.Shared.DTO.Modes;
using SomNet.Shared.Enums;
using Xunit;

namespace SomNet.Device.LocalGateway.Tests;

public sealed class LocalGatewayWebTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string ApiKey = "SomNet-Dev-Device-Gateway-Key-2026";

    private readonly WebApplicationFactory<Program> _factory;

    public LocalGatewayWebTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IAutomaticDeviceJobRunner>();
                services.RemoveAll<ISomEspLocalSessionClient>();
                services.AddSingleton<ISomEspLocalSessionClient, StubSessionClient>();
                services.AddSingleton<IAutomaticDeviceJobRunner, StubJobRunner>();
            });
        });
    }

    [Fact]
    public async Task Health_does_not_require_api_key()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/health");
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<HealthResponse>();
        Assert.Equal("ok", body?.Status);
    }

    [Fact]
    public async Task Device_status_requires_api_key()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/v1/device/status");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Device_status_returns_combined_payload_with_api_key()
    {
        var client = CreateAuthorizedClient();
        var response = await client.GetAsync("/api/v1/device/status");
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<DeviceGatewayCombinedStatusDto>();
        Assert.NotNull(body);
        Assert.False(body!.Local.AutomaticActive);
        Assert.Equal("192.168.0.50", body.Device.Ip);
    }

    [Fact]
    public async Task Automatic_run_returns_completed_payload()
    {
        var client = CreateAuthorizedClient();
        var request = new AutomaticRunRequestDto
        {
            Parameters = new AutomaticControlStateDto
            {
                AutomaticMode = AutomaticRunMode.Periodic,
                EndSessionMode = EndSessionMode.Strokes,
                EndSessionValue = 3,
            },
        };

        var response = await client.PostAsJsonAsync("/api/v1/automatic/run", request);
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<AutomaticRunResponseDto>();
        Assert.NotNull(body);
        Assert.Equal("Completed", body!.Status);
        Assert.Equal("Periodic — 1 main strokes over 1 min (end session rule)", body.Summary);
    }

    [Fact]
    public async Task Automatic_run_rejects_concurrent_gateway_calls_with_409()
    {
        var gate = new SemaphoreSlim(0, 1);
        var factory = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IAutomaticDeviceJobRunner>();
                services.RemoveAll<ISomEspLocalSessionClient>();
                services.AddSingleton<ISomEspLocalSessionClient, StubSessionClient>();
                services.AddSingleton<IAutomaticDeviceJobRunner, SlowJobRunner>(sp => new SlowJobRunner(gate));
            });
        });

        var firstClient = CreateAuthorizedClient(factory);
        var secondClient = CreateAuthorizedClient(factory);

        var request = new AutomaticRunRequestDto
        {
            Parameters = new AutomaticControlStateDto { AutomaticMode = AutomaticRunMode.Periodic },
        };

        var first = firstClient.PostAsJsonAsync("/api/v1/automatic/run", request);
        await Task.Delay(100);
        var second = await secondClient.PostAsJsonAsync("/api/v1/automatic/run", request);

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        gate.Release();
        (await first).EnsureSuccessStatusCode();
    }

    private HttpClient CreateAuthorizedClient() => CreateAuthorizedClient(_factory);

    private static HttpClient CreateAuthorizedClient(WebApplicationFactory<Program> factory)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(GatewayApiKeyMiddleware.ApiKeyHeaderName, ApiKey);
        return client;
    }

    private sealed record HealthResponse(string Status);

    private sealed class StubSessionClient : ISomEspLocalSessionClient
    {
        public Task<LocalUnlockResponse> UnlockAsync(
            string? pin = null,
            string? newPin = null,
            CancellationToken cancellationToken = default) =>
            throw new NotImplementedException();

        public Task LockAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task ArmAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task DisarmAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task<LocalOperateStatus> GetLocalStatusAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(new LocalOperateStatus());

        public Task<DeviceApiStatus> GetDeviceStatusAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(new DeviceApiStatus
            {
                Standalone = true,
                WifiConnected = true,
                Ip = "192.168.0.50",
            });

        public Task<LocalCommandAcceptedResponse> SendCommandAsync(
            string commandKey,
            string payloadJson = "{}",
            CancellationToken cancellationToken = default) =>
            throw new NotImplementedException();
    }

    private sealed class StubJobRunner : IAutomaticDeviceJobRunner
    {
        public Task<AutomaticDeviceJobResult> RunAutomaticAsync(
            AutomaticControlStateDto parameters,
            AutomaticDeviceJobRunOptions? runOptions = null,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(new AutomaticDeviceJobResult
            {
                Status = AutomaticDeviceJobStatus.Completed,
                Message = "Periodic — 1 main strokes over 1 min (end session rule)",
                Summary = "Periodic — 1 main strokes over 1 min (end session rule)",
                Result = new AutomaticSessionResultDto
                {
                    CommandKey = "automatic-stop",
                    AutomaticMode = "periodic",
                    StrokesCompleted = 1,
                    DurationMs = 60_000,
                    EndReason = "endSession",
                },
                StartedAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1),
                EndedAtUtc = DateTimeOffset.UtcNow,
                DeviceCorrelationId = "local-test",
            });
    }

    private sealed class SlowJobRunner : IAutomaticDeviceJobRunner
    {
        private readonly SemaphoreSlim _gate;

        public SlowJobRunner(SemaphoreSlim gate) => _gate = gate;

        public async Task<AutomaticDeviceJobResult> RunAutomaticAsync(
            AutomaticControlStateDto parameters,
            AutomaticDeviceJobRunOptions? runOptions = null,
            CancellationToken cancellationToken = default)
        {
            await _gate.WaitAsync(cancellationToken);
            await Task.Delay(50, cancellationToken);

            return new AutomaticDeviceJobResult
            {
                Status = AutomaticDeviceJobStatus.Completed,
                Message = "done",
            };
        }
    }
}
