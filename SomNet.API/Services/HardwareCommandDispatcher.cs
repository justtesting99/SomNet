using Microsoft.AspNetCore.SignalR;
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

    public HardwareCommandDispatcher(
        IDeviceTokenService deviceTokenService,
        IDeviceConnectionRegistry connectionRegistry,
        IHubContext<HardwareHub> hubContext)
    {
        _deviceTokenService = deviceTokenService;
        _connectionRegistry = connectionRegistry;
        _hubContext = hubContext;
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

        await _hubContext.Clients
            .Group(HardwareHubGroups.Paired(registration.DomTarget, registration.SubName))
            .SendAsync(HardwareHubMethods.ExecuteCommand, message, cancellationToken);

        var acknowledgement = await _connectionRegistry.WaitForAcknowledgementAsync(
            correlationId,
            AckTimeout,
            cancellationToken);

        if (acknowledgement is null)
        {
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
        };
    }
}
