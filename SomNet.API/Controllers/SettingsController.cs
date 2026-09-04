using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SomNet.API.Services;
using SomNet.Shared.DTO.Settings;

namespace SomNet.API.Controllers;

[Authorize]
[ApiController]
[Route("api/settings")]
public class SettingsController : ControllerBase
{
    private readonly ISomNetDataStore _dataStore;

    public SettingsController(ISomNetDataStore dataStore)
    {
        _dataStore = dataStore;
    }

    [HttpGet]
    public ActionResult<PairingSettingsDto> Get([FromQuery] string subTarget)
    {
        var domTarget = GetDomTarget();

        if (domTarget is null)
        {
            return Unauthorized();
        }

        return Ok(_dataStore.GetPairingSettings(domTarget, subTarget));
    }

    [HttpPut]
    public ActionResult<PairingSettingsDto> Save(
        [FromQuery] string subTarget,
        [FromBody] PairingSettingsDto settings)
    {
        var domTarget = GetDomTarget();

        if (domTarget is null)
        {
            return Unauthorized();
        }

        try
        {
            return Ok(_dataStore.SavePairingSettings(domTarget, subTarget, settings));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
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
