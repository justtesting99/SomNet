using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;
using SomNet.API.Services;
using SomNet.Shared.DTO.Devices;
using SomNet.Shared.Models;

namespace SomNet.API.Hubs;

public sealed class HardwareHub : Hub
{
    private readonly IDeviceConnectionRegistry _connectionRegistry;
    private readonly IDeviceTokenService _deviceTokenService;
    private readonly ILogger<HardwareHub> _logger;

    public HardwareHub(
        IDeviceConnectionRegistry connectionRegistry,
        IDeviceTokenService deviceTokenService,
        ILogger<HardwareHub> logger)
    {
        _connectionRegistry = connectionRegistry;
        _deviceTokenService = deviceTokenService;
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        var httpContext = Context.GetHttpContext();
        var queryDeviceId = httpContext?.Request.Query["deviceId"].ToString();

        if (Context.User?.Identity?.IsAuthenticated == true)
        {
            var role = Context.User.FindFirstValue(DeviceClaimTypes.Role);

            if (string.Equals(role, DeviceClaimTypes.DeviceRole, StringComparison.Ordinal))
            {
                await RegisterPairedDeviceAsync(Context.User);
                await base.OnConnectedAsync();
                return;
            }

            var domTarget = GetDomTargetFromUser(Context.User);
            if (domTarget is not null)
            {
                _connectionRegistry.RegisterOperator(domTarget, Context.ConnectionId);
                await Groups.AddToGroupAsync(Context.ConnectionId, HardwareHubGroups.Operator(domTarget));
                await base.OnConnectedAsync();
                return;
            }
        }

        if (!string.IsNullOrWhiteSpace(queryDeviceId))
        {
            var deviceId = queryDeviceId.Trim();
            _connectionRegistry.RegisterUnpaired(deviceId, Context.ConnectionId, GetRemoteIp(httpContext));
            await Groups.AddToGroupAsync(Context.ConnectionId, HardwareHubGroups.Unpaired(deviceId));
            _logger.LogInformation("Unpaired device {DeviceId} connected with connection {ConnectionId}.", deviceId, Context.ConnectionId);

            if (await _deviceTokenService.TryDeliverPendingPairingAsync(deviceId, Context.ConnectionAborted))
            {
                _logger.LogInformation("Delivered pending pairing token to unpaired device {DeviceId}.", deviceId);
            }

            await base.OnConnectedAsync();
            return;
        }

        Context.Abort();
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        var removed = _connectionRegistry.Unregister(Context.ConnectionId);
        if (removed is { Role: HardwareConnectionRole.Paired })
        {
            if (exception is null)
            {
                _logger.LogInformation(
                    "Paired device {DeviceId} disconnected from {DomTarget}/{SubTarget}.",
                    removed.DeviceId,
                    removed.DomTarget,
                    removed.SubTarget);
            }
            else
            {
                _logger.LogInformation(
                    exception,
                    "Paired device {DeviceId} disconnected from {DomTarget}/{SubTarget}: {DisconnectReason}",
                    removed.DeviceId,
                    removed.DomTarget,
                    removed.SubTarget,
                    exception.Message);
            }
        }
        else if (removed is { Role: HardwareConnectionRole.Unpaired })
        {
            _logger.LogInformation(
                "Unpaired device {DeviceId} disconnected.",
                removed.DeviceId);
        }

        return base.OnDisconnectedAsync(exception);
    }

    public async Task AckCommand(HardwareCommandAckDto acknowledgement)
    {
        _connectionRegistry.CompleteAcknowledgement(acknowledgement);

        var domTarget = Context.User?.FindFirstValue(DeviceClaimTypes.DomTarget);
        if (!string.IsNullOrWhiteSpace(domTarget))
        {
            await Clients
                .Group(HardwareHubGroups.Operator(domTarget.Trim()))
                .SendAsync(HardwareHubMethods.CommandAcknowledged, acknowledgement);
        }
    }

    private async Task RegisterPairedDeviceAsync(ClaimsPrincipal user)
    {
        var deviceId = user.FindFirstValue(DeviceClaimTypes.DeviceId) ??
            user.FindFirstValue(JwtRegisteredClaimNames.Sub);

        var domTarget = user.FindFirstValue(DeviceClaimTypes.DomTarget);
        var subTarget = user.FindFirstValue(DeviceClaimTypes.SubTarget);

        if (string.IsNullOrWhiteSpace(deviceId) ||
            string.IsNullOrWhiteSpace(domTarget) ||
            string.IsNullOrWhiteSpace(subTarget))
        {
            Context.Abort();
            return;
        }

        _connectionRegistry.RegisterPaired(deviceId, domTarget, subTarget, Context.ConnectionId, GetRemoteIp(Context.GetHttpContext()));
        await Groups.AddToGroupAsync(Context.ConnectionId, HardwareHubGroups.Paired(domTarget, subTarget));
        await _deviceTokenService.MarkConnectedAsync(domTarget, subTarget, deviceId, Context.ConnectionAborted);

        _logger.LogInformation(
            "Paired device {DeviceId} connected for {DomTarget}/{SubTarget}.",
            deviceId,
            domTarget,
            subTarget);
    }

    private static string? GetDomTargetFromUser(ClaimsPrincipal user)
    {
        var displayName = user.FindFirstValue(JwtRegisteredClaimNames.Name) ??
            user.FindFirstValue(ClaimTypes.Name);

        if (!string.IsNullOrWhiteSpace(displayName))
        {
            return displayName.Trim();
        }

        var username = user.FindFirstValue(JwtRegisteredClaimNames.Sub) ??
            user.FindFirstValue(ClaimTypes.NameIdentifier) ??
            user.Identity?.Name;

        return string.IsNullOrWhiteSpace(username) ? null : username.Trim();
    }

    private static string? GetRemoteIp(HttpContext? httpContext)
    {
        var address = httpContext?.Connection.RemoteIpAddress;
        if (address is null)
        {
            return null;
        }

        if (address.IsIPv4MappedToIPv6)
        {
            address = address.MapToIPv4();
        }

        return address.ToString();
    }
}

public static class HardwareHubExtensions
{
    public static Task SendPairDeviceAsync(
        this IHubContext<HardwareHub> hubContext,
        string deviceId,
        PairDeviceMessageDto message,
        CancellationToken cancellationToken = default)
    {
        return Task.WhenAll(
            hubContext.Clients
                .Group(HardwareHubGroups.Unpaired(deviceId))
                .SendAsync(HardwareHubMethods.PairDevice, message, cancellationToken),
            hubContext.Clients
                .Group(HardwareHubGroups.Paired(message.DomTarget, message.SubTarget))
                .SendAsync(HardwareHubMethods.PairDevice, message, cancellationToken));
    }
}
