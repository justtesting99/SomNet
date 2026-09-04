using System.Text.RegularExpressions;
using SomNet.Shared.DTO.Auth;

namespace SomNet.API.Services;

public static partial class AuthValidation
{
    public const int MinPasswordLength = 8;
    public const int MaxPasswordLength = 128;
    public const int MinUsernameLength = 3;
    public const int MaxUsernameLength = 32;

    private static readonly Regex UsernamePattern = UsernameRegex();

    public static string? ValidateUsername(string? username)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return "Username is required.";
        }

        var trimmed = username.Trim();

        if (trimmed.Length < MinUsernameLength || trimmed.Length > MaxUsernameLength)
        {
            return $"Username must be between {MinUsernameLength} and {MaxUsernameLength} characters.";
        }

        if (!UsernamePattern.IsMatch(trimmed))
        {
            return "Username may only contain letters, numbers, underscores, and hyphens.";
        }

        return null;
    }

    public static string? ValidatePassword(string? password)
    {
        if (string.IsNullOrWhiteSpace(password))
        {
            return "Password is required.";
        }

        if (password.Length < MinPasswordLength || password.Length > MaxPasswordLength)
        {
            return $"Password must be between {MinPasswordLength} and {MaxPasswordLength} characters.";
        }

        return null;
    }

    public static string NormalizeUsername(string username) => username.Trim();

    public static string NormalizeDisplayName(string? displayName, string username)
    {
        var trimmed = displayName?.Trim();

        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return username;
        }

        return trimmed.Length > 256 ? trimmed[..256] : trimmed;
    }

    [GeneratedRegex("^[a-zA-Z0-9_-]+$")]
    private static partial Regex UsernameRegex();
}
