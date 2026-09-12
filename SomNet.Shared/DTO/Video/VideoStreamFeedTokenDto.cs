namespace SomNet.Shared.DTO.Video;

public sealed class VideoStreamFeedTokenDto
{
    public required string Feed { get; init; }

    public required string Token { get; init; }

    public required string Url { get; init; }

    public required DateTimeOffset ExpiresAt { get; init; }
}
