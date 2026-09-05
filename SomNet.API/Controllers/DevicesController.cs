using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SomNet.API.Services;
using SomNet.Shared.DTO.Devices;

namespace SomNet.API.Controllers;

[Authorize]
[ApiController]
[Route("api/devices")]
public class DevicesController : ControllerBase
{
    private readonly IDeviceTokenService _deviceTokenService;
    private readonly IHardwareCommandDispatcher _commandDispatcher;

    public DevicesController(
        IDeviceTokenService deviceTokenService,
        IHardwareCommandDispatcher commandDispatcher)
    {
        _deviceTokenService = deviceTokenService;
        _commandDispatcher = commandDispatcher;
    }

    [HttpGet("status")]
    public async Task<ActionResult<DeviceStatusResponseDto>> GetStatus(
        [FromQuery] string subTarget,
        CancellationToken cancellationToken)
    {
        var domTarget = GetDomTarget();
        if (domTarget is null)
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(subTarget))
        {
            return BadRequest("subTarget is required.");
        }

        return Ok(await _deviceTokenService.GetStatusAsync(domTarget, subTarget, cancellationToken));
    }

    [HttpPost("pair")]
    public async Task<ActionResult<PairDeviceResponseDto>> PairDevice(
        [FromQuery] string subTarget,
        [FromBody] PairDeviceRequestDto request,
        CancellationToken cancellationToken)
    {
        var domTarget = GetDomTarget();
        if (domTarget is null)
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(subTarget))
        {
            return BadRequest("subTarget is required.");
        }

        try
        {
            return Ok(await _deviceTokenService.PairDeviceAsync(
                domTarget,
                subTarget,
                request.DeviceId,
                cancellationToken));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpDelete("pair")]
    public async Task<IActionResult> RevokePairing(
        [FromQuery] string subTarget,
        CancellationToken cancellationToken)
    {
        var domTarget = GetDomTarget();
        if (domTarget is null)
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(subTarget))
        {
            return BadRequest("subTarget is required.");
        }

        await _deviceTokenService.RevokeAsync(domTarget, subTarget, cancellationToken);
        return NoContent();
    }

    [HttpPost("commands")]
    public async Task<ActionResult<SendHardwareCommandResponseDto>> SendCommand(
        [FromBody] SendHardwareCommandRequestDto request,
        CancellationToken cancellationToken)
    {
        var domTarget = GetDomTarget();
        if (domTarget is null)
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(request.SubTarget))
        {
            return BadRequest("subTarget is required.");
        }

        if (string.IsNullOrWhiteSpace(request.CommandKey))
        {
            return BadRequest("commandKey is required.");
        }

        var response = await _commandDispatcher.SendCommandAsync(
            domTarget,
            request.SubTarget,
            request.CommandKey,
            request.PayloadJson,
            cancellationToken);

        return Ok(response);
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
