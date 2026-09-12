namespace SomNet.API.Configuration;

public sealed class VideoStreamSettings
{
    public const string SectionName = "Video";

    public int StreamTokenExpireMinutes { get; init; } = 30;

    public string StreamTokenAudience { get; init; } = "SomNet.VideoStream";

    public string FrontEmbedPath { get; init; } = "/go2rtc/stream.html?src=front";

    public string RearEmbedPath { get; init; } = "/go2rtc/stream.html?src=rear";
}
