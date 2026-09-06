using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using SomNet.API.Hubs;
using SomNet.Shared.DTO.Devices;
using SomNet.Shared.Models;

namespace SomNet.API.Services;

public interface IHardwareCommandDispatcher
{
    Task<SendHardwareCommandResponseDto> SendCommandAsync(
        string domTarget,
        string subTarget,
        string commandKey,
        string payloadJson,
        CancellationToken cancellationToken = default);
}

public sealed class HardwareCommandDispatcher : IHardwareCommandDispatcher
{
    private static readonly TimeSpan AckTimeout = TimeSpan.FromSeconds(10);

    private readonly IDeviceTokenService _deviceTokenService;
    private readonly IDeviceConnectionRegistry _connectionRegistry;
    private readonly IHubContext<HardwareHub> _hubContext;
    private readonly ILogger<HardwareCommandDispatcher> _logger;

    public HardwareCommandDispatcher(
        IDeviceTokenService deviceTokenService,
        IDeviceConnectionRegistry connectionRegistry,
        IHubContext<HardwareHub> hubContext,
        ILogger<HardwareCommandDispatcher> logger)
    {
        _deviceTokenService = deviceTokenService;
        _connectionRegistry = connectionRegistry;
        _hubContext = hubContext;
        _logger = logger;
    }

    public async Task<SendHardwareCommandResponseDto> SendCommandAsync(
        string domTarget,
        string subTarget,
        string commandKey,
        string payloadJson,
        CancellationToken cancellationToken = default)
    {
        var registration = await _deviceTokenService.GetActiveRegistrationAsync(domTarget, subTarget, cancellationToken);

        if (registration is null)
        {
            _logger.LogWarning(
                "Hardware command {CommandKey} rejected — no active registration for {DomTarget}/{SubTarget}.",
                commandKey,
                domTarget,
                subTarget);

            return new SendHardwareCommandResponseDto
            {
                CorrelationId = Guid.NewGuid().ToString("N"),
                Delivered = false,
                Acknowledged = false,
                Success = false,
                Message = "No paired device token exists for this Sub target.",
            };
        }

        if (!_connectionRegistry.IsPairedDeviceConnected(domTarget, subTarget))
        {
            _logger.LogWarning(
                "Hardware command {CommandKey} rejected — paired device offline for {DomTarget}/{SubTarget}.",
                commandKey,
                domTarget,
                subTarget);

            return new SendHardwareCommandResponseDto
            {
                CorrelationId = Guid.NewGuid().ToString("N"),
                Delivered = false,
                Acknowledged = false,
                Success = false,
                Message = "The paired device is not connected.",
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

        var hubGroup = HardwareHubGroups.Paired(registration.DomTarget, registration.SubName);

        _logger.LogInformation(
            "Sending hardware command {CommandKey} correlationId={CorrelationId} to group {HubGroup} deviceId={DeviceId}.",
            commandKey,
            correlationId,
            hubGroup,
            registration.DeviceId);

        await _hubContext.Clients
            .Group(hubGroup)
            .SendAsync(HardwareHubMethods.ExecuteCommand, message, cancellationToken);

        var acknowledgement = await _connectionRegistry.WaitForAcknowledgementAsync(
            correlationId,
            AckTimeout,
            cancellationToken);

        if (acknowledgement is null)
        {
            _logger.LogWarning(
                "Hardware command {CommandKey} correlationId={CorrelationId} timed out waiting for device ack (group {HubGroup}).",
                commandKey,
                correlationId,
                hubGroup);

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
}
