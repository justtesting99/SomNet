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

    SessionHistoryEntryDto? GetActiveSession(string domTarget, string subTarget, string? deviceId = null);

    SessionHistoryEntryDto GetSession(string domTarget, string sessionId);

    SessionHistoryEntryDto StartSession(string domTarget, StartSessionRequestDto request);

    SessionHistoryEntryDto UpdateSession(string domTarget, string sessionId, UpdateSessionRequestDto request);

    SessionHistoryEntryDto EndSession(string domTarget, string sessionId, EndSessionRequestDto request);

    /// <summary>Removes a session row that is still at the initial in-progress placeholder (P16 accessory off with no activity).</summary>
    void DeleteInProgressSession(string domTarget, string sessionId);

    /// <summary>Sub-scoped app/video settings (legacy DomSubSettings row).</summary>
    PairingSettingsDto GetPairingSettings(string domTarget, string subTarget);

    PairingSettingsDto GetPairingSettings(string domTarget, string subTarget, string deviceId);

    PairingSettingsDto SavePairingSettings(
        string domTarget,
        string subTarget,
        string deviceId,
        PairingSettingsDto settings);
}
