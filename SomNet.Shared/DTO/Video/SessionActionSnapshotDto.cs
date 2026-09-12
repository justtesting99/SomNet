namespace SomNet.Shared.DTO.Video;

public sealed class SessionActionSnapshotDto
{
    public int Id { get; init; }

    public required string SessionId { get; init; }

    public int ActionIndex { get; init; }

    public required string Feed { get; init; }

    public required string ImageUrl { get; init; }

    public DateTimeOffset CapturedAt { get; init; }

    public string? CommandKey { get; init; }

    public string? CorrelationId { get; init; }
}
