using SomNet.Shared.DTO.Auth;

namespace SomNet.API.Services;

public interface IAuthService
{
    LoginResponseDto? Login(LoginRequestDto request);

    UserDto? GetUser(string username);

    (LoginResponseDto? Response, string? Error, bool IsConflict) Register(RegisterRequestDto request);

    (ChangePasswordResponseDto? Response, string? Error, bool IsUnauthorized) ChangePassword(
        string username,
        ChangePasswordRequestDto request);
}
