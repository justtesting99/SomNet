namespace SomNet.Shared.DTO.Auth;

public sealed class ChangePasswordResponseDto
{
    public required AuthTokenDto Token { get; init; }
}
