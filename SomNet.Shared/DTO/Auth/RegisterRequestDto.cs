namespace SomNet.Shared.DTO.Auth;

public sealed class RegisterRequestDto
{
    public required string Username { get; init; }

    public required string Password { get; init; }

    public string? DisplayName { get; init; }
}
