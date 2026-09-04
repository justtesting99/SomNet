namespace SomNet.Shared.DTO.Auth;

public sealed class ChangePasswordRequestDto
{
    public required string CurrentPassword { get; init; }

    public required string NewPassword { get; init; }
}
