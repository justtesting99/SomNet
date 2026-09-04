using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SomNet.API.Services;
using SomNet.Shared.DTO.Subs;
using SomNet.Shared.Models;

namespace SomNet.API.Controllers;

[Authorize]
[ApiController]
[Route("api/subs")]
public class SubsController : ControllerBase
{
    private readonly ISomNetDataStore _dataStore;

    public SubsController(ISomNetDataStore dataStore)
    {
        _dataStore = dataStore;
    }

    [HttpGet]
    public ActionResult<SubsResponseDto> GetSubs()
    {
        var domTarget = GetDomTarget();

        if (domTarget is null)
        {
            return Unauthorized();
        }

        return Ok(new SubsResponseDto
        {
            ControllerRole = SessionUserConstants.ControllerRole,
            SubRole = SessionUserConstants.SubRole,
            Subs = _dataStore.GetSubsUnderDom(domTarget),
        });
    }

    [HttpPost]
    public ActionResult<SubsResponseDto> AddSub([FromBody] AddDomSubRequestDto request)
    {
        var domTarget = GetDomTarget();

        if (domTarget is null)
        {
            return Unauthorized();
        }

        try
        {
            var subs = _dataStore.AddDomSub(domTarget, request.SubName);
            return Ok(new SubsResponseDto
            {
                ControllerRole = SessionUserConstants.ControllerRole,
                SubRole = SessionUserConstants.SubRole,
                Subs = subs,
            });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(ex.Message);
        }
    }

    [HttpDelete]
    public ActionResult<SubsResponseDto> RemoveSub([FromQuery] string subName)
    {
        var domTarget = GetDomTarget();

        if (domTarget is null)
        {
            return Unauthorized();
        }

        try
        {
            var subs = _dataStore.RemoveDomSub(domTarget, subName);
            return Ok(new SubsResponseDto
            {
                ControllerRole = SessionUserConstants.ControllerRole,
                SubRole = SessionUserConstants.SubRole,
                Subs = subs,
            });
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

public sealed class SubsResponseDto
{
    public required string ControllerRole { get; init; }

    public required string SubRole { get; init; }

    public required IReadOnlyList<string> Subs { get; init; }
}
