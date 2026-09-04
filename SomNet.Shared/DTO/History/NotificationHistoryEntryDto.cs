using SomNet.Shared.Enums;

namespace SomNet.Shared.DTO.History;

public sealed class NotificationHistoryEntryDto
{
    public required string Id { get; init; }

    public required DateTimeOffset SentAt { get; init; }

    public required string DomTarget { get; init; }

    public SubTargetName SubTarget { get; init; }

    public string Subject { get; init; } = "Upcoming Session";

    public required DateTimeOffset SessionDateTime { get; init; }
}
