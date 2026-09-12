namespace SomNet.API.Data.Entities;

public sealed class SessionActionSnapshot
{
    public int Id { get; set; }

    public required string SessionId { get; set; }

    public required string DomTarget { get; set; }

    public int ActionIndex { get; set; }

    public required string Feed { get; set; }

    public required string RelativePath { get; set; }

    public DateTimeOffset CapturedAt { get; set; }

    public string? CommandKey { get; set; }

    public string? CorrelationId { get; set; }
}
