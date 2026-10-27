using SomNet.Shared.Enums;

namespace SomNet.API.Data.Entities;

public sealed class SessionHistoryEntry
{
    public required string Id { get; set; }

    public DateTimeOffset StartedAt { get; set; }

    public required string DomTarget { get; set; }

    public required string SubTarget { get; set; }

    /// <summary>V2: ESP that owns this scene session; null = legacy Sub-wide row.</summary>
    public string? DeviceId { get; set; }

    public OperationMode Mode { get; set; }

    public required string Summary { get; set; }
}
