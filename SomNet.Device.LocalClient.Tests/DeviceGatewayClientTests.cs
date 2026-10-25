using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using SomNet.Device.LocalClient;
using SomNet.Shared.DTO.DeviceGateway;
using SomNet.Shared.DTO.Modes;
using SomNet.Shared.Enums;
using Xunit;

namespace SomNet.Device.LocalClient.Tests;

public sealed class DeviceGatewayClientTests
{
    [Fact]
    public async Task RunAutomatic_deserializes_completed_response()
    {
        var responseDto = new AutomaticRunResponseDto
        {
            Status = "Completed",
            Message = "ok",
            Summary = "Periodic — 1 main strokes over 1 min (end session rule)",
            StartedAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1),
            EndedAtUtc = DateTimeOffset.UtcNow,
            DeviceCorrelationId = "local-abc",
        };

        var handler = new StubHandler(_ =>
            JsonResponse(HttpStatusCode.OK, responseDto));
        var client = CreateClient(handler);

        var result = await client.RunAutomaticAsync(new AutomaticRunRequestDto
        {
            Parameters = new AutomaticControlStateDto { AutomaticMode = AutomaticRunMode.Periodic },
        });

        Assert.True(result.IsSuccess);
        Assert.Equal("Completed", result.Response!.Status);
        Assert.Equal("local-abc", result.Response.DeviceCorrelationId);
    }

    [Fact]
    public async Task RunAutomatic_detects_gateway_concurrent_409()
    {
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.Conflict)
        {
            Content = new StringContent(
                """{"status":"ConcurrentRun","message":"busy"}""",
                Encoding.UTF8,
                "application/json"),
        });

        var client = CreateClient(handler);
        var result = await client.RunAutomaticAsync(new AutomaticRunRequestDto
        {
            Parameters = new AutomaticControlStateDto { AutomaticMode = AutomaticRunMode.Periodic },
        });

        Assert.True(result.IsGatewayConcurrentRun);
        Assert.Equal(
            DeviceGatewaySchedulerDisposition.SkipUntilNextSchedule,
            DeviceGatewaySchedulerPolicy.GetDisposition(result));
    }

    [Fact]
    public async Task RunAutomatic_maps_failed_precondition_to_skip()
    {
        var handler = new StubHandler(_ => JsonResponse(HttpStatusCode.Conflict, new AutomaticRunResponseDto
        {
            Status = "FailedPrecondition",
            Message = "Device busy",
        }));

        var client = CreateClient(handler);
        var result = await client.RunAutomaticAsync(new AutomaticRunRequestDto
        {
            Parameters = new AutomaticControlStateDto { AutomaticMode = AutomaticRunMode.Periodic },
        });

        Assert.True(result.IsFailedPrecondition);
        Assert.Equal(
            DeviceGatewaySchedulerDisposition.SkipUntilNextSchedule,
            DeviceGatewaySchedulerPolicy.GetDisposition(result));
    }

    [Fact]
    public async Task SchedulerPolicy_backoff_caps_at_one_hour()
    {
        var delay = DeviceGatewaySchedulerPolicy.GetUnreachableBackoff(100, TimeSpan.FromMinutes(10));
        Assert.Equal(TimeSpan.FromHours(1), delay);
    }

    [Fact]
    public void Job_record_builder_persists_result_json()
    {
        var response = new AutomaticRunResponseDto
        {
            Status = "Completed",
            Message = "done",
            Summary = "summary line",
            Result = new AutomaticSessionResultDto
            {
                CommandKey = "automatic-stop",
                StrokesCompleted = 3,
                DurationMs = 60_000,
            },
            StartedAtUtc = new DateTimeOffset(2026, 1, 2, 3, 4, 5, TimeSpan.Zero),
            EndedAtUtc = new DateTimeOffset(2026, 1, 2, 3, 5, 5, TimeSpan.Zero),
            DeviceCorrelationId = "local-1",
        };

        var record = AutomaticRunJobRecordBuilder.FromGatewayResponse(
            response,
            jobId: "job-9",
            scheduleId: "sched-1",
            gatewayCorrelationId: "gw-corr");

        Assert.Equal("job-9", record.JobId);
        Assert.Equal("Completed", record.Status);
        Assert.Contains("automatic-stop", record.ResultJson, StringComparison.Ordinal);
        Assert.Equal("gw-corr", record.GatewayCorrelationId);
    }

    private static DeviceGatewayClient CreateClient(HttpMessageHandler handler)
    {
        var http = new HttpClient(handler) { BaseAddress = new Uri("http://gateway.test/") };
        return new DeviceGatewayClient(
            http,
            Options.Create(new DeviceGatewayClientOptions()));
    }

    private static HttpResponseMessage JsonResponse(HttpStatusCode code, object body)
    {
        var json = JsonSerializer.Serialize(body, AutomaticRunJobRecordBuilder.CreateJsonOptions());
        return new HttpResponseMessage(code)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json"),
        };
    }

    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _factory;

        public StubHandler(Func<HttpRequestMessage, HttpResponseMessage> factory) => _factory = factory;

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) =>
            Task.FromResult(_factory(request));
    }
}
