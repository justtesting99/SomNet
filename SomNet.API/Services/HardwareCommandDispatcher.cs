using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SomNet.API.Configuration;
using SomNet.API.Hubs;
using SomNet.Shared.DTO.Devices;
using SomNet.Shared.Models;

namespace SomNet.API.Services;

public interface IHardwareCommandDispatcher
{
    Task<SendHardwareCommandResponseDto> SendCommandAsync(
        string domTarget,
        string subTarget,
        string deviceId,
        string commandKey,
        string payloadJson,
        CancellationToken cancellationToken = default);
}

public sealed class HardwareCommandDispatcher : IHardwareCommandDispatcher
{
    private readonly IDeviceTokenService _deviceTokenService;
    private readonly IDeviceConnectionRegistry _connectionRegistry;
    private readonly IHubContext<HardwareHub> _hubContext;
    private readonly ILogger<HardwareCommandDispatcher> _logger;
    private readonly StrokeMsLimitsOptions _strokeMsLimits;

    public HardwareCommandDispatcher(
        IDeviceTokenService deviceTokenService,
        IDeviceConnectionRegistry connectionRegistry,
        IHubContext<HardwareHub> hubContext,
        ILogger<HardwareCommandDispatcher> logger,
        IOptions<StrokeMsLimitsOptions> strokeMsLimits)
    {
        _deviceTokenService = deviceTokenService;
        _connectionRegistry = connectionRegistry;
        _hubContext = hubContext;
        _logger = logger;
        _strokeMsLimits = strokeMsLimits.Value;
    }

    public async Task<SendHardwareCommandResponseDto> SendCommandAsync(
        string domTarget,
        string subTarget,
        string deviceId,
        string commandKey,
        string payloadJson,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(deviceId))
        {
            return new SendHardwareCommandResponseDto
            {
                CorrelationId = Guid.NewGuid().ToString("N"),
                Delivered = false,
                Acknowledged = false,
                Success = false,
                Message = "deviceId is required.",
            };
        }

        var normalizedDeviceId = deviceId.Trim();
        var registration = await _deviceTokenService.GetActiveRegistrationAsync(
            domTarget,
            subTarget,
            normalizedDeviceId,
            cancellationToken);

        if (registration is null)
        {
            _logger.LogWarning(
                "Hardware command {CommandKey} rejected — no active registration for {DomTarget}/{SubTarget}/{DeviceId}.",
                commandKey,
                domTarget,
                subTarget,
                normalizedDeviceId);

            return new SendHardwareCommandResponseDto
            {
                CorrelationId = Guid.NewGuid().ToString("N"),
                Delivered = false,
                Acknowledged = false,
                Success = false,
                Message = "No paired device token exists for this Sub target and deviceId.",
            };
        }

        if (!_connectionRegistry.TryGetPairedConnectionId(
                domTarget,
                subTarget,
                normalizedDeviceId,
                out var connectionId))
        {
            _logger.LogWarning(
                "Hardware command {CommandKey} rejected — paired device offline for {DomTarget}/{SubTarget}/{DeviceId}.",
                commandKey,
                domTarget,
                subTarget,
                normalizedDeviceId);

            return new SendHardwareCommandResponseDto
            {
                CorrelationId = Guid.NewGuid().ToString("N"),
                Delivered = false,
                Acknowledged = false,
                Success = false,
                Message = "The paired device is not connected.",
            };
        }

        if (!HardwareCommandPayloadValidator.TryValidate(
                commandKey,
                payloadJson,
                ResolveMaxStrokeMs(),
                registration.ActuatorKind,
                out var validationError))
        {
            _logger.LogWarning(
                "Hardware command {CommandKey} rejected — invalid payload for {DomTarget}/{SubTarget}/{DeviceId}: {ValidationError}",
                commandKey,
                domTarget,
                subTarget,
                normalizedDeviceId,
                validationError);

            return new SendHardwareCommandResponseDto
            {
                CorrelationId = Guid.NewGuid().ToString("N"),
                Delivered = false,
                Acknowledged = false,
                Success = false,
                Message = validationError,
            };
        }

        var correlationId = Guid.NewGuid().ToString("N");
        var message = new HardwareCommandMessageDto
        {
            CorrelationId = correlationId,
            CommandKey = commandKey,
            AccessToken = registration.AccessToken,
            DomTarget = registration.DomTarget,
            SubTarget = registration.SubName,
            DeviceId = registration.DeviceId,
            PayloadJson = string.IsNullOrWhiteSpace(payloadJson) ? "{}" : payloadJson,
        };

        _logger.LogInformation(
            "Sending hardware command {CommandKey} correlationId={CorrelationId} to deviceId={DeviceId} connection={ConnectionId}.",
            commandKey,
            correlationId,
            registration.DeviceId,
            connectionId);

        await _hubContext.Clients
            .Client(connectionId)
            .SendAsync(HardwareHubMethods.ExecuteCommand, message, cancellationToken);

        var ackTimeout = HardwareCommandAckTimeout.Resolve(commandKey, payloadJson);

        var acknowledgement = await _connectionRegistry.WaitForAcknowledgementAsync(
            correlationId,
            ackTimeout,
            cancellationToken);

        if (acknowledgement is null)
        {
            _logger.LogWarning(
                "Hardware command {CommandKey} correlationId={CorrelationId} timed out waiting for device ack (deviceId={DeviceId}).",
                commandKey,
                correlationId,
                normalizedDeviceId);

            return new SendHardwareCommandResponseDto
            {
                CorrelationId = correlationId,
                Delivered = true,
                Acknowledged = false,
                Success = false,
                Message = "Command was sent but the device did not acknowledge in time.",
            };
        }

        return new SendHardwareCommandResponseDto
        {
            CorrelationId = correlationId,
            Delivered = true,
            Acknowledged = true,
            Success = acknowledgement.Success,
            Message = acknowledgement.Message
                ?? (acknowledgement.Success
                    ? "Device acknowledged the command."
                    : "Device rejected the command."),
            ResultJson = acknowledgement.ResultJson,
        };
    }

    private int ResolveMaxStrokeMs()
    {
        var absoluteMinimum = _strokeMsLimits.AbsoluteMinimum;
        var absoluteMaximum = _strokeMsLimits.AbsoluteMaximum;

        if (absoluteMaximum < absoluteMinimum)
        {
            (absoluteMinimum, absoluteMaximum) = (absoluteMaximum, absoluteMinimum);
        }

        return absoluteMaximum;
    }
}
