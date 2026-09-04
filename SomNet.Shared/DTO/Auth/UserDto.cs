namespace SomNet.Shared.DTO.Auth;

public sealed class UserDto
{
    public required string Username { get; init; }

    public required string DisplayName { get; init; }
}
