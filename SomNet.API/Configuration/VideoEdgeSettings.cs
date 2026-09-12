namespace SomNet.API.Configuration;

public sealed class VideoEdgeSettings
{
    public const string SectionName = "Video:Edge";

    public bool Enabled { get; init; }

    public string AgentBaseUrl { get; init; } = "http://localhost:5190";

    public string ApiKey { get; init; } = string.Empty;

    public bool RequireTokenForGo2Rtc { get; init; } = true;
}
