using System.Net;
using System.Text;
using Xunit;
using SomNet.Device.LocalClient;
using SomNet.Device.LocalClient.Models;

namespace SomNet.Device.LocalClient.Tests;

public sealed class SomEspLocalClientTests
{
    [Fact]
    public async Task Unlock_Arm_SendCommand_uses_bearer_and_payload_shape()
    {
        var handler = new RecordingHandler();
        handler.Enqueue(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                """{"token":"abc","expiresAtMs":999,"unlocked":true}""",
                Encoding.UTF8,
                "application/json"),
        });
        handler.Enqueue(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("""{"armed":true}""", Encoding.UTF8, "application/json"),
        });
        handler.Enqueue(request =>
        {
            Assert.Equal(HttpMethod.Post, request.Method);
            Assert.EndsWith("/api/local/commands", request.RequestUri?.PathAndQuery);
            Assert.Equal("Bearer", request.Headers.Authorization?.Scheme);
            Assert.Equal("abc", request.Headers.Authorization?.Parameter);

            var body = request.Content!.ReadAsStringAsync().GetAwaiter().GetResult();
            Assert.Contains("\"commandKey\":\"automatic-start\"", body);
            Assert.Contains("\"automaticMode\":\"periodic\"", body);

            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    """{"accepted":true,"correlationId":"local-deadbeef"}""",
                    Encoding.UTF8,
                    "application/json"),
            };
        });

        using var http = new HttpClient(handler) { BaseAddress = new Uri("http://esp.test/") };
        var client = new SomEspLocalClient(
            http,
            new SomEspLocalClientOptions { Pin = "1234" });

        var unlock = await client.UnlockAsync();
        Assert.Equal("abc", unlock.Token);
        Assert.Equal("abc", client.BearerToken);

        await client.ArmAsync();

        var accepted = await client.SendCommandAsync(
            "automatic-start",
            """{"automaticMode":"periodic","minimumStrokeMs":25,"maximumStrokeMs":400}""");

        Assert.True(accepted.Accepted);
        Assert.Equal("local-deadbeef", accepted.CorrelationId);
        Assert.Equal(3, handler.Requests.Count);
    }

    [Fact]
    public async Task Unlock_invalid_pin_throws_with_device_error_code()
    {
        var handler = new RecordingHandler();
        handler.Enqueue(_ => new HttpResponseMessage(HttpStatusCode.Unauthorized)
        {
            Content = new StringContent("""{"error":"invalid_pin"}""", Encoding.UTF8, "application/json"),
        });

        using var http = new HttpClient(handler) { BaseAddress = new Uri("http://esp.test/") };
        var client = new SomEspLocalClient(http, new SomEspLocalClientOptions { Pin = "wrong" });

        var ex = await Assert.ThrowsAsync<SomEspLocalApiException>(() => client.UnlockAsync());
        Assert.Equal(401, ex.StatusCode);
        Assert.Equal("invalid_pin", ex.DeviceErrorCode);
    }

    [Fact]
    public async Task Arm_without_unlock_throws()
    {
        using var http = new HttpClient(new RecordingHandler()) { BaseAddress = new Uri("http://esp.test/") };
        var client = new SomEspLocalClient(http, new SomEspLocalClientOptions { Pin = "1234" });

        await Assert.ThrowsAsync<InvalidOperationException>(() => client.ArmAsync());
    }

    [Fact]
    public async Task GetLocalStatus_parses_resultJson_string()
    {
        var handler = new RecordingHandler();
        handler.Enqueue(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                """
                {
                  "unlocked":true,
                  "armed":true,
                  "busy":false,
                  "automaticActive":false,
                  "wifiConnected":true,
                  "resultJson":"{\"commandKey\":\"automatic-stop\",\"strokesCompleted\":3}"
                }
                """,
                Encoding.UTF8,
                "application/json"),
        });

        using var http = new HttpClient(handler) { BaseAddress = new Uri("http://esp.test/") };
        var client = new SomEspLocalClient(http, new SomEspLocalClientOptions());

        var status = await client.GetLocalStatusAsync();
        Assert.False(status.AutomaticActive);
        Assert.NotNull(status.ResultJson);
        Assert.Contains("automatic-stop", status.ResultJson);

        using var parsed = status.TryParseResultJson();
        Assert.NotNull(parsed);
        Assert.Equal(3, parsed!.RootElement.GetProperty("strokesCompleted").GetInt32());
    }

    private sealed class RecordingHandler : HttpMessageHandler
    {
        private readonly Queue<Func<HttpRequestMessage, HttpResponseMessage>> _responses = new();

        public List<HttpRequestMessage> Requests { get; } = new();

        public void Enqueue(Func<HttpRequestMessage, HttpResponseMessage> responder) =>
            _responses.Enqueue(responder);

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Requests.Add(request);
            if (_responses.Count == 0)
            {
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
            }

            return Task.FromResult(_responses.Dequeue()(request));
        }
    }
}
