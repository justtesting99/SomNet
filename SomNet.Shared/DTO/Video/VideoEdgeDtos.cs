namespace SomNet.Shared.DTO.Video;

public sealed class VideoSessionStartedDto
{
    public required string SessionId { get; init; }

    public required string DomTarget { get; init; }

    public required string SubTarget { get; init; }

    public string? Mode { get; init; }
}

public sealed class VideoSessionEndedDto
{
    public required string SessionId { get; init; }

    public required string DomTarget { get; init; }

    public required string SubTarget { get; init; }
}
