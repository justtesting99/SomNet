namespace SomNet.Shared.DTO.Auth;

public sealed class LoginResponseDto
{
    public required UserDto User { get; init; }
}
