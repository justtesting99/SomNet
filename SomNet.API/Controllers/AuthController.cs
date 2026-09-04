using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SomNet.API.Services;
using SomNet.Shared.DTO.Auth;

namespace SomNet.API.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    [AllowAnonymous]
    [HttpPost("login")]
    public ActionResult<LoginResponseDto> Login([FromBody] LoginRequestDto request)
    {
        var response = _authService.Login(request);

        if (response is null)
        {
            return Unauthorized();
        }

        return Ok(response);
    }

    [AllowAnonymous]
    [HttpPost("register")]
    public ActionResult<LoginResponseDto> Register([FromBody] RegisterRequestDto request)
    {
        var (response, error, isConflict) = _authService.Register(request);

        if (error is not null)
        {
            return isConflict ? Conflict(error) : BadRequest(error);
        }

        return Ok(response);
    }

    [Authorize]
    [HttpPost("change-password")]
    public ActionResult<ChangePasswordResponseDto> ChangePassword([FromBody] ChangePasswordRequestDto request)
    {
        var username = GetAuthenticatedUsername();

        if (username is null)
        {
            return Unauthorized();
        }

        var (response, error, isUnauthorized) = _authService.ChangePassword(username, request);

        if (error is not null)
        {
            return isUnauthorized ? Unauthorized(error) : BadRequest(error);
        }

        return Ok(response);
    }

    [Authorize]
    [HttpGet("me")]
    public ActionResult<UserDto> Me()
    {
        var username = GetAuthenticatedUsername();

        if (username is null)
        {
            return Unauthorized();
        }

        var user = _authService.GetUser(username);

        if (user is null)
        {
            return Unauthorized();
        }

        return Ok(user);
    }

    private string? GetAuthenticatedUsername() =>
        User.FindFirstValue(JwtRegisteredClaimNames.Sub) ??
        User.FindFirstValue(ClaimTypes.NameIdentifier) ??
        User.Identity?.Name;
}
