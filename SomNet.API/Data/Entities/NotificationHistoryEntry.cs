using SomNet.Shared.Enums;

namespace SomNet.API.Data.Entities;

public sealed class NotificationHistoryEntry
{
    public required string Id { get; set; }

    public DateTimeOffset SentAt { get; set; }

    public required string DomTarget { get; set; }

    public required string SubTarget { get; set; }

    public required string Subject { get; set; }

    public DateTimeOffset SessionDateTime { get; set; }
}
