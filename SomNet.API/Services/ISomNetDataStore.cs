using SomNet.Shared.DTO.History;
using SomNet.Shared.DTO.Notifications;
using SomNet.Shared.DTO.Settings;

namespace SomNet.API.Services;

public interface ISomNetDataStore
{
    IReadOnlyList<SessionHistoryEntryDto> GetSessionsForDom(string domTarget, string? subTarget = null);

    IReadOnlyList<HistoryTimelineItemDto> GetTimeline(HistoryQueryDto query);

    IReadOnlyList<string> GetSubsUnderDom(string domTarget);

    IReadOnlyList<string> AddDomSub(string domTarget, string subName);

    IReadOnlyList<string> RemoveDomSub(string domTarget, string subName);

    NotificationHistoryEntryDto AddNotification(SendSessionNotificationRequestDto request);

    SessionHistoryEntryDto StartSession(string domTarget, StartSessionRequestDto request);

    SessionHistoryEntryDto UpdateSession(string domTarget, string sessionId, UpdateSessionRequestDto request);

    SessionHistoryEntryDto EndSession(string domTarget, string sessionId, EndSessionRequestDto request);

    PairingSettingsDto GetPairingSettings(string domTarget, string subTarget);

    PairingSettingsDto SavePairingSettings(
        string domTarget,
        string subTarget,
        PairingSettingsDto settings);
}
