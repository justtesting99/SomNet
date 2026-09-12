using SomNet.Shared.DTO.History;

namespace SomNet.API.Services;

public interface IVideoEdgeNotificationService
{
    void NotifySessionStarted(SessionHistoryEntryDto session);

    void NotifySessionEnded(string sessionId, string domTarget, string subTarget);
}
