using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SomNet.API.Services;
using SomNet.Shared.DTO.History;

namespace SomNet.API.Controllers;

[Authorize]
[ApiController]
[Route("api/sessions")]
public class SessionsController : ControllerBase
{
    private readonly ISomNetDataStore _dataStore;
    private readonly IVideoStreamTokenService _videoStreamTokenService;
    private readonly IVideoEdgeNotificationService _videoEdgeNotificationService;

    public SessionsController(
        ISomNetDataStore dataStore,
        IVideoStreamTokenService videoStreamTokenService,
        IVideoEdgeNotificationService videoEdgeNotificationService)
    {
        _dataStore = dataStore;
        _videoStreamTokenService = videoStreamTokenService;
        _videoEdgeNotificationService = videoEdgeNotificationService;
    }

    [HttpGet("active")]
    public ActionResult<SessionHistoryEntryDto> GetActive([FromQuery] string subTarget)
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
            var session = _dataStore.GetActiveSession(domTarget, subTarget);
            return session is null ? NotFound() : Ok(session);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpPost]
    public ActionResult<SessionHistoryEntryDto> Start([FromBody] StartSessionRequestDto request)
    {
        var domTarget = GetDomTarget();

        if (domTarget is null)
        {
            return Unauthorized();
        }

        try
        {
            var started = _dataStore.StartSession(domTarget, request);
            _videoEdgeNotificationService.NotifySessionStarted(started);
            return Ok(started);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpPatch("{sessionId}")]
    public ActionResult<SessionHistoryEntryDto> Update(
        string sessionId,
        [FromBody] UpdateSessionRequestDto request)
    {
        var domTarget = GetDomTarget();

        if (domTarget is null)
        {
            return Unauthorized();
        }

        try
        {
            return Ok(_dataStore.UpdateSession(domTarget, sessionId, request));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ex.Message);
        }
    }

    [HttpPost("{sessionId}/end")]
    public ActionResult<SessionHistoryEntryDto> End(
        string sessionId,
        [FromBody] EndSessionRequestDto request)
    {
        var domTarget = GetDomTarget();

        if (domTarget is null)
        {
            return Unauthorized();
        }

        try
        {
            var ended = _dataStore.EndSession(domTarget, sessionId, request);
            _videoStreamTokenService.RevokeSession(sessionId);
            _videoEdgeNotificationService.NotifySessionEnded(ended.Id, ended.DomTarget, ended.SubTarget);
            return Ok(ended);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ex.Message);
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
