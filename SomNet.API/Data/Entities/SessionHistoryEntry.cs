using SomNet.Shared.Enums;

namespace SomNet.API.Data.Entities;

public sealed class SessionHistoryEntry
{
    public required string Id { get; set; }

    public DateTimeOffset StartedAt { get; set; }

    public required string DomTarget { get; set; }

    public SubTargetName SubTarget { get; set; }

    public OperationMode Mode { get; set; }

    public required string Summary { get; set; }
}
