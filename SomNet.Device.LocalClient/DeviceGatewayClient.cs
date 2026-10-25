using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using SomNet.Shared.DTO.DeviceGateway;
using SomNet.Shared.Serialization;

namespace SomNet.Device.LocalClient;

public sealed class DeviceGatewayClient : IDeviceGatewayClient
{
    private readonly HttpClient _http;
    private readonly JsonSerializerOptions _jsonOptions;

    public DeviceGatewayClient(HttpClient http, IOptions<DeviceGatewayClientOptions> options)
    {
        _http = http;
        _ = options.Value;
        _jsonOptions = AutomaticRunJobRecordBuilder.CreateJsonOptions();
    }

    public async Task<DeviceGatewayCombinedStatusDto> GetDeviceStatusAsync(
        CancellationToken cancellationToken = default)
    {
        using var response = await _http.GetAsync("/api/v1/device/status", cancellationToken);
        await EnsureSuccessOrThrowAsync(response, cancellationToken);

        var body = await response.Content.ReadFromJsonAsync<DeviceGatewayCombinedStatusDto>(
            _jsonOptions,
            cancellationToken);

        return body ?? throw new InvalidOperationException("Empty device status response from gateway.");
    }

    public async Task<DeviceGatewayAutomaticRunResult> RunAutomaticAsync(
        AutomaticRunRequestDto request,
        string? correlationId = null,
        CancellationToken cancellationToken = default)
    {
        using var message = new HttpRequestMessage(HttpMethod.Post, "/api/v1/automatic/run")
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
        };
    }

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
