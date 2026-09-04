using SomNet.Shared.DTO.History;
using SomNet.Shared.DTO.Notifications;
using SomNet.Shared.DTO.Options;
using SomNet.Shared.Enums;

namespace SomNet.API.Services;

public interface IMockDataStore
{
    IReadOnlyList<SessionHistoryEntryDto> GetSessionsForDom(string domTarget, SubTargetName? subTarget = null);

    IReadOnlyList<HistoryTimelineItemDto> GetTimeline(HistoryQueryDto query);

    IReadOnlyList<SubTargetName> GetSubsUnderDom(string domTarget);

    NotificationHistoryEntryDto AddNotification(SendSessionNotificationRequestDto request);

    AppOptionsDto GetOptions(string username);

    AppOptionsDto SaveOptions(string username, AppOptionsDto options);
}
