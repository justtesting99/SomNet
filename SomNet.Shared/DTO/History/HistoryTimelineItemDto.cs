using System.Text.Json.Serialization;
using SomNet.Shared.Enums;

namespace SomNet.Shared.DTO.History;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(SessionHistoryTimelineItemDto), "session")]
[JsonDerivedType(typeof(NotificationHistoryTimelineItemDto), "notification")]
public abstract class HistoryTimelineItemDto;

public sealed class SessionHistoryTimelineItemDto : HistoryTimelineItemDto
{
    public required SessionHistoryEntryDto Entry { get; init; }
}

public sealed class NotificationHistoryTimelineItemDto : HistoryTimelineItemDto
{
    public required NotificationHistoryEntryDto Entry { get; init; }
}

public sealed class HistoryQueryDto
{
    public required string DomTarget { get; init; }

    public SubTargetName SubTarget { get; init; }

    public DateOnly? FromDate { get; init; }

    public DateOnly? ToDate { get; init; }
}
