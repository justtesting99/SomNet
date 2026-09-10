namespace SomNet.API.Services;

internal static class SessionProgressHelper
{
    public static bool IsInProgress(string? summary)
    {
        if (string.IsNullOrWhiteSpace(summary))
        {
            return false;
        }

        var trimmed = summary.Trim();
        return trimmed.Equals("In progress", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("In progress:", StringComparison.OrdinalIgnoreCase);
    }
}
