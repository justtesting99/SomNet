namespace SomNet.Shared.DTO.Video;

public sealed class SessionVideoTokensResponseDto
{
    public required VideoStreamFeedTokenDto Front { get; init; }

    public required VideoStreamFeedTokenDto Rear { get; init; }
}
