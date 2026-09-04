using SomNet.Shared.DTO.History;
using SomNet.Shared.DTO.Notifications;
using SomNet.Shared.DTO.Options;
using SomNet.Shared.Enums;

namespace SomNet.API.Services;

public interface ISomNetDataStore
{
    IReadOnlyList<SessionHistoryEntryDto> GetSessionsForDom(string domTarget, SubTargetName? subTarget = null);

    IReadOnlyList<HistoryTimelineItemDto> GetTimeline(HistoryQueryDto query);

    IReadOnlyList<SubTargetName> GetSubsUnderDom(string domTarget);

    NotificationHistoryEntryDto AddNotification(SendSessionNotificationRequestDto request);

    SessionHistoryEntryDto StartSession(string domTarget, StartSessionRequestDto request);

    SessionHistoryEntryDto UpdateSession(string domTarget, string sessionId, UpdateSessionRequestDto request);

    SessionHistoryEntryDto EndSession(string domTarget, string sessionId, EndSessionRequestDto request);

    AppOptionsDto GetOptions(string username);

    AppOptionsDto SaveOptions(string username, AppOptionsDto options);
}
