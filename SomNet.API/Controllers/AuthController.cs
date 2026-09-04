using Microsoft.AspNetCore.Mvc;
using SomNet.Shared.DTO.Auth;

namespace SomNet.API.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    [HttpPost("login")]
    public ActionResult<LoginResponseDto> Login([FromBody] LoginRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
        {
            return Unauthorized();
        }

        var username = request.Username.Trim();

        return Ok(new LoginResponseDto
        {
            User = new UserDto
            {
                Username = username,
                DisplayName = username,
            },
        });
    }
}
