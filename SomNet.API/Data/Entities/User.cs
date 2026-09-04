namespace SomNet.API.Data.Entities;

public sealed class User
{
    public required string Username { get; set; }

    public required string PasswordHash { get; set; }

    public required string DisplayName { get; set; }
}
