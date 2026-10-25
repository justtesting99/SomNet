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
            builder.ConfigureServices(services => WireStubRunner(services));
        });
    }

    [Fact]
    public async Task Gateway_metrics_requires_api_key()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/v1/gateway/metrics");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
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
                WireStubRunner(services, new SlowJobRunner(gate)));
        });

        var firstClient = CreateAuthorizedClient(factory);
        var secondClient = CreateAuthorizedClient(factory);

        var request = new AutomaticRunRequestDto
        {
            Parameters = new AutomaticControlStateDto { AutomaticMode = AutomaticRunMode.Periodic },
        };

        try
        {
            using var runMessage = JsonContent.Create(request);
            var first = firstClient.SendAsync(
                new HttpRequestMessage(HttpMethod.Post, "/api/v1/automatic/run") { Content = runMessage },
                HttpCompletionOption.ResponseHeadersRead);
            await Task.Delay(300);
            var second = await secondClient.PostAsJsonAsync("/api/v1/automatic/run", request);

            Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
            gate.Release();
            (await first).EnsureSuccessStatusCode();
        }
        finally
        {
            if (gate.CurrentCount == 0)
            {
                gate.Release();
            }
        }
    }

    [Fact]
    public async Task Automatic_stop_returns_404_when_no_run_active()
    {
        var client = CreateAuthorizedClient();
        var response = await client.PostAsJsonAsync("/api/v1/automatic/stop", new AutomaticStopRequestDto());
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<AutomaticStopResponseDto>();
        Assert.Equal("NoActiveRun", body?.Status);
    }

    [Fact]
    public async Task Automatic_stop_accepts_while_run_in_progress()
    {
        var gate = new SemaphoreSlim(0, 1);
        var session = new RecordingSessionClient();
        var factory = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
                WireStubRunner(services, new SlowJobRunner(gate), session));
        });

        var client = CreateAuthorizedClient(factory);
        var runRequest = new AutomaticRunRequestDto
        {
            Parameters = new AutomaticControlStateDto { AutomaticMode = AutomaticRunMode.Periodic },
        };

        var runTask = client.PostAsJsonAsync("/api/v1/automatic/run", runRequest);
        await Task.Delay(100);

        var stopResponse = await client.PostAsJsonAsync(
            "/api/v1/automatic/stop",
            new AutomaticStopRequestDto { Abort = false });
        stopResponse.EnsureSuccessStatusCode();

        var stopBody = await stopResponse.Content.ReadFromJsonAsync<AutomaticStopResponseDto>();
        Assert.Equal("StopAccepted", stopBody?.Status);
        Assert.Contains("automatic-stop", session.Commands);

        gate.Release();
        await runTask;
    }

    private HttpClient CreateAuthorizedClient() => CreateAuthorizedClient(_factory);

    private static HttpClient CreateAuthorizedClient(WebApplicationFactory<Program> factory)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(GatewayApiKeyMiddleware.ApiKeyHeaderName, ApiKey);
        return client;
    }

    internal static void WireStubRunner(
        IServiceCollection services,
        IAutomaticDeviceJobRunner? runner = null,
        ISomEspLocalSessionClient? sessionClient = null)
    {
        services.RemoveAll<IAutomaticDeviceJobRunnerFactory>();
        services.RemoveAll<ISomEspLocalSessionClientFactory>();
        services.RemoveAll<IAutomaticDeviceJobRunner>();
        services.RemoveAll<ISomEspLocalSessionClient>();

        sessionClient ??= new StubSessionClient();
        runner ??= new StubJobRunner();
        services.AddSingleton(sessionClient);
        services.AddSingleton(runner);
        services.AddSingleton<ISomEspLocalSessionClientFactory>(sp =>
            new RegistryAwareSessionClientFactory(
                sp.GetRequiredService<IConfiguredDeviceRegistry>(),
                sessionClient));
        services.AddSingleton<IAutomaticDeviceJobRunnerFactory>(sp =>
            new RegistryAwareJobRunnerFactory(
                sp.GetRequiredService<IConfiguredDeviceRegistry>(),
                runner));
    }

    private sealed record HealthResponse(string Status);

    private sealed class RegistryAwareSessionClientFactory : ISomEspLocalSessionClientFactory
    {
        private readonly IConfiguredDeviceRegistry _registry;
        private readonly ISomEspLocalSessionClient _client;

        public RegistryAwareSessionClientFactory(
            IConfiguredDeviceRegistry registry,
            ISomEspLocalSessionClient client)
        {
            _registry = registry;
            _client = client;
        }

        public ISomEspLocalSessionClient GetClient(string deviceId)
        {
            _registry.GetRequired(deviceId);
            return _client;
        }
    }

    private sealed class RegistryAwareJobRunnerFactory : IAutomaticDeviceJobRunnerFactory
    {
        private readonly IConfiguredDeviceRegistry _registry;
        private readonly IAutomaticDeviceJobRunner _runner;

        public RegistryAwareJobRunnerFactory(
            IConfiguredDeviceRegistry registry,
            IAutomaticDeviceJobRunner runner)
        {
            _registry = registry;
            _runner = runner;
        }

        public IAutomaticDeviceJobRunner CreateRunner(string deviceId)
        {
            _registry.GetRequired(deviceId);
            return _runner;
        }
    }

    private sealed class RecordingSessionClient : ISomEspLocalSessionClient
    {
        public List<string> Commands { get; } = new();

        public Task<LocalUnlockResponse> UnlockAsync(
            string? pin = null,
            string? newPin = null,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(new LocalUnlockResponse { Token = "t", Unlocked = true, ExpiresAtMs = 1 });

        public Task LockAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task ArmAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task DisarmAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task<LocalOperateStatus> GetLocalStatusAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(new LocalOperateStatus());

        public Task<DeviceApiStatus> GetDeviceStatusAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(new DeviceApiStatus { Standalone = true, WifiConnected = true });

        public Task<LocalCommandAcceptedResponse> SendCommandAsync(
            string commandKey,
            string payloadJson = "{}",
            CancellationToken cancellationToken = default)
        {
            Commands.Add(commandKey);
            return Task.FromResult(new LocalCommandAcceptedResponse
            {
                Accepted = true,
                CorrelationId = "local-stop-test",
            });
        }
    }

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
