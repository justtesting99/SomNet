using System.Text.RegularExpressions;

namespace SomNet.Shared.Models;

public static partial class SubTargetValidation
{
    public const int MinLength = 2;
    public const int MaxLength = 32;

    public static string? Validate(string? subName)
    {
        if (string.IsNullOrWhiteSpace(subName))
        {
            return "Sub name is required.";
        }

        var trimmed = subName.Trim();

        if (trimmed.Length < MinLength || trimmed.Length > MaxLength)
        {
            return $"Sub name must be between {MinLength} and {MaxLength} characters.";
        }

        if (!SubNamePattern().IsMatch(trimmed))
        {
            return "Sub name must start with a letter and contain only letters, numbers, underscores, or hyphens.";
        }

        return null;
    }

    public static string Normalize(string subName) => subName.Trim();

    [GeneratedRegex("^[a-zA-Z][a-zA-Z0-9_-]+$")]
    private static partial Regex SubNamePattern();
}
