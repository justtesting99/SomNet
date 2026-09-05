using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SomNet.API.Services;
using SomNet.Shared.DTO.System;
using SomNet.Shared.Enums;

namespace SomNet.API.Controllers;

[Authorize]
[ApiController]
[Route("api/system")]
public class SystemStatusController : ControllerBase
{
    private readonly IDeviceConnectionRegistry _connectionRegistry;
    private readonly IDeviceTokenService _deviceTokenService;

    public SystemStatusController(
        IDeviceConnectionRegistry connectionRegistry,
        IDeviceTokenService deviceTokenService)
    {
        _connectionRegistry = connectionRegistry;
        _deviceTokenService = deviceTokenService;
    }

    [HttpGet("status")]
    public async Task<ActionResult<SystemStatusResponseDto>> GetStatus(
        [FromQuery] string? subTarget,
        CancellationToken cancellationToken)
    {
        var domTarget = GetDomTarget();
        var signalRState = _connectionRegistry.IsSignalRActive()
            ? ConnectionState.Online
            : ConnectionState.Offline;

        if (domTarget is null || string.IsNullOrWhiteSpace(subTarget))
        {
            return Ok(new SystemStatusResponseDto
            {
                Api = ConnectionState.Online,
                Device = ConnectionState.Offline,
                SignalR = signalRState,
                Message = "API online. Select a Sub target to view device connection status.",
            });
        }

        var status = await _deviceTokenService.GetStatusAsync(domTarget, subTarget, cancellationToken);
        var deviceState = status.IsConnected
            ? ConnectionState.Online
            : status.IsPaired
                ? ConnectionState.Connecting
                : ConnectionState.Offline;

        var message = status.IsConnected
            ? $"Device {status.DeviceId} connected for {status.SubTarget}."
            : status.IsPaired
                ? $"Device {status.DeviceId} is paired but not connected."
                : "No device paired for this Sub target.";

        return Ok(new SystemStatusResponseDto
        {
            Api = ConnectionState.Online,
            Device = deviceState,
            SignalR = signalRState,
            DeviceName = status.DeviceId,
            Message = message,
        });
    }

    private string? GetDomTarget()
    {
        var displayName = User.FindFirstValue(JwtRegisteredClaimNames.Name) ??
            User.FindFirstValue(ClaimTypes.Name);

        if (!string.IsNullOrWhiteSpace(displayName))
        {
            return displayName.Trim();
        }

        var username = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ??
            User.FindFirstValue(ClaimTypes.NameIdentifier) ??
            User.Identity?.Name;

        return string.IsNullOrWhiteSpace(username) ? null : username.Trim();
    }
}
