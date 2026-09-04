namespace SomNet.Shared.DTO.Auth;

public sealed class AuthTokenDto
{
    public required string AccessToken { get; init; }

    public required DateTimeOffset ExpiresAt { get; init; }
}
