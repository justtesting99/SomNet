namespace SomNet.API.Services;

public static class VideoStreamFeedNames
{
    public const string Front = "front";
    public const string Rear = "rear";

    public static string NormalizeBaseFeed(string requestedFeed)
    {
        var src = requestedFeed.Trim();

        if (MatchesFeed(src, Front))
        {
            return Front;
        }

        if (MatchesFeed(src, Rear))
        {
            return Rear;
        }

        return src;
    }

    public static bool FeedMatchesRequest(string tokenFeed, string requestedFeed)
    {
        if (string.IsNullOrWhiteSpace(requestedFeed))
        {
            return true;
        }

        var normalized = NormalizeBaseFeed(requestedFeed);
        return string.Equals(normalized, tokenFeed.Trim(), StringComparison.OrdinalIgnoreCase);
    }

    private static bool MatchesFeed(string src, string baseFeed) =>
        string.Equals(src, baseFeed, StringComparison.OrdinalIgnoreCase) ||
        src.StartsWith(baseFeed + "_", StringComparison.OrdinalIgnoreCase);
}
