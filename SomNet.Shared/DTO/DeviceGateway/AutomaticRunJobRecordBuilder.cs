using System.Text.Json;
using System.Text.Json.Serialization;
using SomNet.Shared.DTO.Modes;
using SomNet.Shared.Serialization;

namespace SomNet.Shared.DTO.DeviceGateway;

public static class AutomaticRunJobRecordBuilder
{
    public static AutomaticRunJobRecordDto FromGatewayResponse(
        AutomaticRunResponseDto response,
        string? jobId = null,
        string? scheduleId = null,
        AutomaticControlStateDto? parametersSnapshot = null,
        string? gatewayCorrelationId = null,
        JsonSerializerOptions? jsonOptions = null)
    {
        jsonOptions ??= CreateJsonOptions();

        return new AutomaticRunJobRecordDto
        {
            JobId = jobId,
            ScheduleId = scheduleId,
            Status = response.Status,
            Message = response.Message,
            Summary = response.Summary,
            ResultJson = response.Result is null
                ? null
                : JsonSerializer.Serialize(response.Result, jsonOptions),
            StartedAtUtc = response.StartedAtUtc,
            EndedAtUtc = response.EndedAtUtc,
            DeviceCorrelationId = response.DeviceCorrelationId,
            GatewayCorrelationId = gatewayCorrelationId,
            ParametersSnapshot = parametersSnapshot,
        };
    }

    public static JsonSerializerOptions CreateJsonOptions()
    {
        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        };
        SomNetJsonOptions.Configure(options);
        return options;
    }
}
