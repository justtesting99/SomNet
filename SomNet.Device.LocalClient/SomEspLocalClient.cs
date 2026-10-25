using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using SomNet.Device.LocalClient.Models;

namespace SomNet.Device.LocalClient;

public sealed class SomEspLocalClient : ISomEspLocalSessionClient
{
    private readonly HttpClient _http;
    private readonly SomEspLocalClientOptions _options;
    private string? _bearerToken;

    public SomEspLocalClient(HttpClient http, IOptions<SomEspLocalClientOptions> options)
    {
        _http = http;
        _options = options.Value;
        ConfigureHttpClientBaseAddress();
    }

    public string? BearerToken => _bearerToken;

    public async Task<LocalUnlockResponse> UnlockAsync(
        string? pin = null,
        string? newPin = null,
        CancellationToken cancellationToken = default)
    {
        var effectivePin = string.IsNullOrWhiteSpace(pin) ? _options.Pin : pin;
        if (string.IsNullOrWhiteSpace(effectivePin))
        {
            throw new InvalidOperationException("PIN is required. Set Device:Pin or pass pin to UnlockAsync.");
        }

        var body = new JsonObject
        {
            ["pin"] = effectivePin,
        };

        if (!string.IsNullOrWhiteSpace(newPin))
        {
            body["newPin"] = newPin;
        }

        var response = await _http.PostAsJsonAsync(
            "/api/local/unlock",
            body,
            LocalClientJson.Options,
            cancellationToken);

        var unlock = await ReadSuccessAsync<LocalUnlockResponse>(response, cancellationToken);
        _bearerToken = unlock.Token;
        return unlock;
    }

    public async Task LockAsync(CancellationToken cancellationToken = default)
    {
        using var request = CreateAuthorizedRequest(HttpMethod.Post, "/api/local/lock");
        var response = await _http.SendAsync(request, cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);
        _bearerToken = null;
    }

    public async Task ArmAsync(CancellationToken cancellationToken = default)
    {
        using var request = CreateAuthorizedRequest(HttpMethod.Post, "/api/local/arm");
        var response = await _http.SendAsync(request, cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);
    }

    public async Task DisarmAsync(CancellationToken cancellationToken = default)
    {
        using var request = CreateAuthorizedRequest(HttpMethod.Post, "/api/local/disarm");
        var response = await _http.SendAsync(request, cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);
    }

    public async Task<LocalOperateStatus> GetLocalStatusAsync(CancellationToken cancellationToken = default)
    {
        var response = await _http.GetAsync("/api/local/status", cancellationToken);
        return await ReadSuccessAsync<LocalOperateStatus>(response, cancellationToken);
    }

    public async Task<DeviceApiStatus> GetDeviceStatusAsync(CancellationToken cancellationToken = default)
    {
        var response = await _http.GetAsync("/api/status", cancellationToken);
        return await ReadSuccessAsync<DeviceApiStatus>(response, cancellationToken);
    }

    public async Task<LocalCommandAcceptedResponse> SendCommandAsync(
        string commandKey,
        string payloadJson = "{}",
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(commandKey))
        {
            throw new ArgumentException("commandKey is required.", nameof(commandKey));
        }

        var payloadNode = ParsePayloadJson(payloadJson);
        var body = new JsonObject
        {
            ["commandKey"] = commandKey,
            ["payloadJson"] = payloadNode,
        };

        using var request = CreateAuthorizedRequest(HttpMethod.Post, "/api/local/commands");
        request.Content = JsonContent.Create(body, options: LocalClientJson.Options);

        var response = await _http.SendAsync(request, cancellationToken);
        return await ReadSuccessAsync<LocalCommandAcceptedResponse>(response, cancellationToken);
    }

    private void ConfigureHttpClientBaseAddress()
    {
        if (_http.BaseAddress is null && !string.IsNullOrWhiteSpace(_options.BaseUrl))
        {
            _http.BaseAddress = new Uri(_options.BaseUrl.TrimEnd('/') + "/");
        }

        _http.Timeout = _options.HttpTimeout;
    }

    private HttpRequestMessage CreateAuthorizedRequest(HttpMethod method, string path)
    {
        if (string.IsNullOrWhiteSpace(_bearerToken))
        {
            throw new InvalidOperationException("Not unlocked. Call UnlockAsync first.");
        }

        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _bearerToken);
        return request;
    }

    private static JsonNode ParsePayloadJson(string payloadJson)
    {
        var text = string.IsNullOrWhiteSpace(payloadJson) ? "{}" : payloadJson;
        try
        {
            return JsonNode.Parse(text) ?? new JsonObject();
        }
        catch (JsonException ex)
        {
            throw new ArgumentException("payloadJson is not valid JSON.", nameof(payloadJson), ex);
        }
    }

    private static async Task<T> ReadSuccessAsync<T>(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        await EnsureSuccessAsync(response, cancellationToken);
        var value = await response.Content.ReadFromJsonAsync<T>(LocalClientJson.Options, cancellationToken);
        if (value is null)
        {
            throw new SomEspLocalApiException(
                (int)response.StatusCode,
                null,
                "Device returned an empty JSON body.");
        }

        return value;
    }

    private static async Task EnsureSuccessAsync(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        var statusCode = (int)response.StatusCode;
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        string? deviceError = null;

        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("error", out var errorElement) &&
                errorElement.ValueKind == JsonValueKind.String)
            {
                deviceError = errorElement.GetString();
            }
        }
        catch (JsonException)
        {
            // ignore
        }

        var message = deviceError is not null
            ? $"SomEsp local API error ({statusCode}): {deviceError}"
            : $"SomEsp local API request failed ({statusCode}): {body}";

        throw new SomEspLocalApiException(statusCode, deviceError, message);
    }
}
