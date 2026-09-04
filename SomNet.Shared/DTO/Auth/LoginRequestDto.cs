namespace SomNet.Shared.DTO.Auth;

public sealed class LoginRequestDto
{
    public required string Username { get; init; }

    public required string Password { get; init; }
}
