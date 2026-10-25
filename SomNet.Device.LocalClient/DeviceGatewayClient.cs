using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using SomNet.Shared.DTO.DeviceGateway;
using SomNet.Shared.Serialization;

namespace SomNet.Device.LocalClient;

public sealed class DeviceGatewayClient : IDeviceGatewayClient
{
    private readonly HttpClient _http;
    private readonly DeviceGatewayClientOptions _options;
    private readonly JsonSerializerOptions _jsonOptions;

    public DeviceGatewayClient(HttpClient http, IOptions<DeviceGatewayClientOptions> options)
    {
        _http = http;
        _options = options.Value;
        _jsonOptions = AutomaticRunJobRecordBuilder.CreateJsonOptions();
    }

    public async Task<IReadOnlyList<DeviceGatewayConfiguredDeviceDto>> ListDevicesAsync(
        CancellationToken cancellationToken = default)
    {
        using var response = await _http.GetAsync("/api/v1/devices", cancellationToken);
        await EnsureSuccessOrThrowAsync(response, cancellationToken);

        var body = await response.Content.ReadFromJsonAsync<List<DeviceGatewayConfiguredDeviceDto>>(
            _jsonOptions,
            cancellationToken);

        return body ?? [];
    }

    public async Task<DeviceGatewayCombinedStatusDto> GetDeviceStatusAsync(
        string deviceId,
        CancellationToken cancellationToken = default)
    {
        var path = BuildDevicePath(ResolveDeviceId(deviceId), "status");
        using var response = await _http.GetAsync(path, cancellationToken);
        await EnsureSuccessOrThrowAsync(response, cancellationToken);

        var body = await response.Content.ReadFromJsonAsync<DeviceGatewayCombinedStatusDto>(
            _jsonOptions,
            cancellationToken);

        return body ?? throw new InvalidOperationException("Empty device status response from gateway.");
    }

    public async Task<DeviceGatewayAutomaticRunResult> RunAutomaticAsync(
        string deviceId,
        AutomaticRunRequestDto request,
        string? correlationId = null,
        CancellationToken cancellationToken = default)
    {
        var path = BuildDevicePath(ResolveDeviceId(deviceId), "automatic/run");
        using var message = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = JsonContent.Create(request, options: _jsonOptions),
        };

        if (!string.IsNullOrWhiteSpace(correlationId))
        {
            message.Headers.TryAddWithoutValidation(DeviceGatewayHttp.CorrelationHeaderName, correlationId);
        }

        using var response = await _http.SendAsync(message, cancellationToken);
        var bodyText = await response.Content.ReadAsStringAsync(cancellationToken);
        response.Headers.TryGetValues(DeviceGatewayHttp.CorrelationHeaderName, out var correlationValues);
        var gatewayCorrelationId = correlationValues?.FirstOrDefault();

        if (response.StatusCode == System.Net.HttpStatusCode.Conflict)
        {
            if (TryReadConcurrentRun(bodyText))
            {
                return new DeviceGatewayAutomaticRunResult
                {
                    HttpStatusCode = (int)response.StatusCode,
                    ErrorBody = bodyText,
                    IsGatewayConcurrentRun = true,
                    GatewayCorrelationId = gatewayCorrelationId,
                    DeviceId = deviceId,
                };
            }
        }

        AutomaticRunResponseDto? dto = null;
        if (!string.IsNullOrWhiteSpace(bodyText))
        {
            dto = JsonSerializer.Deserialize<AutomaticRunResponseDto>(bodyText, _jsonOptions);
        }

        return new DeviceGatewayAutomaticRunResult
        {
            HttpStatusCode = (int)response.StatusCode,
            Response = dto,
            ErrorBody = dto is null ? bodyText : null,
            GatewayCorrelationId = gatewayCorrelationId,
            DeviceId = deviceId,
        };
    }

    public async Task<DeviceGatewayStopResult> StopAutomaticAsync(
        string deviceId,
        bool abort = false,
        CancellationToken cancellationToken = default)
    {
        var path = BuildDevicePath(ResolveDeviceId(deviceId), "automatic/stop");
        using var response = await _http.PostAsJsonAsync(
            path,
            new AutomaticStopRequestDto { Abort = abort },
            _jsonOptions,
            cancellationToken);

        var bodyText = await response.Content.ReadAsStringAsync(cancellationToken);
        AutomaticStopResponseDto? dto = null;
        if (!string.IsNullOrWhiteSpace(bodyText))
        {
            dto = JsonSerializer.Deserialize<AutomaticStopResponseDto>(bodyText, _jsonOptions);
        }

        return new DeviceGatewayStopResult
        {
            HttpStatusCode = (int)response.StatusCode,
            Response = dto,
            ErrorBody = dto is null ? bodyText : null,
            DeviceId = deviceId,
        };
    }

    private string ResolveDeviceId(string deviceId)
    {
        if (!string.IsNullOrWhiteSpace(deviceId))
        {
            return deviceId.Trim();
        }

        if (!string.IsNullOrWhiteSpace(_options.DefaultDeviceId))
        {
            return _options.DefaultDeviceId.Trim();
        }

        throw new InvalidOperationException(
            "deviceId is required. Set DeviceGateway:DefaultDeviceId for single-device hosts or pass deviceId explicitly.");
    }

    private static string BuildDevicePath(string deviceId, string suffix) =>
        $"/api/v1/devices/{Uri.EscapeDataString(deviceId)}/{suffix}";

    private static bool TryReadConcurrentRun(string bodyText)
    {
        try
        {
            using var doc = JsonDocument.Parse(bodyText);
            return doc.RootElement.TryGetProperty("status", out var status)
                && string.Equals(status.GetString(), "ConcurrentRun", StringComparison.Ordinal);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static async Task EnsureSuccessOrThrowAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        throw new HttpRequestException(
            $"Device gateway returned {(int)response.StatusCode}: {body}",
            null,
            response.StatusCode);
    }
}
