using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SomNet.API.Configuration;
using SomNet.API.Services;
using SomNet.Shared.DTO.History;
using SomNet.Shared.DTO.Video;
using SomNet.Shared.Models;

namespace SomNet.API.Controllers;

[Authorize]
[ApiController]
[Route("api/video")]
public class VideoController : ControllerBase
{
    private readonly ISomNetDataStore _dataStore;
    private readonly IVideoStreamTokenService _videoStreamTokenService;
    private readonly VideoStreamSettings _videoSettings;

    public VideoController(
        ISomNetDataStore dataStore,
        IVideoStreamTokenService videoStreamTokenService,
        IOptions<VideoStreamSettings> videoSettings)
    {
        _dataStore = dataStore;
        _videoStreamTokenService = videoStreamTokenService;
        _videoSettings = videoSettings.Value;
    }

    [HttpPost("sessions/{sessionId}/tokens")]
    public ActionResult<SessionVideoTokensResponseDto> MintSessionTokens(
        string sessionId,
        [FromQuery] string subTarget)
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

        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return BadRequest("sessionId is required.");
        }

        var normalizedSub = SubTargetValidation.Normalize(subTarget);

        SessionHistoryEntryDto session;
        try
        {
            session = _dataStore.GetSession(domTarget, sessionId.Trim());
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ex.Message);
        }

        if (!SessionProgressHelper.IsInProgress(session.Summary))
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Session is not active.");
        }

        if (!string.Equals(session.SubTarget, normalizedSub, StringComparison.Ordinal))
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Session does not belong to this Sub target.");
        }

        var pairingSettings = _dataStore.GetPairingSettings(domTarget, normalizedSub);
        var tunnelBaseUrl = pairingSettings.Video.TunnelBaseUrl?.Trim() ?? string.Empty;

        var frontPath = VideoStreamTokenService.BuildEmbedPath(
            tunnelBaseUrl,
            "front",
            _videoSettings.FrontEmbedPath);
        var rearPath = VideoStreamTokenService.BuildEmbedPath(
            tunnelBaseUrl,
            "rear",
            _videoSettings.RearEmbedPath);

        var tokens = _videoStreamTokenService.MintSessionTokens(
            session.Id,
            domTarget,
            normalizedSub,
            frontPath,
            rearPath);

        return Ok(tokens);
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
