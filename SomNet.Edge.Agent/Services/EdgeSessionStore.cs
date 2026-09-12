using System.Collections.Concurrent;

namespace SomNet.Edge.Agent.Services;

public sealed class EdgeSessionStore
{
    private readonly ConcurrentDictionary<string, ActiveEdgeSession> _sessions = new(StringComparer.Ordinal);

    public void MarkStarted(string sessionId, string domTarget, string subTarget, string? mode)
    {
        _sessions[sessionId.Trim()] = new ActiveEdgeSession
        {
            SessionId = sessionId.Trim(),
            DomTarget = domTarget.Trim(),
            SubTarget = subTarget.Trim(),
            Mode = mode?.Trim(),
            StartedAtUtc = DateTimeOffset.UtcNow,
        };
    }

    public void MarkEnded(string sessionId)
    {
        _sessions.TryRemove(sessionId.Trim(), out _);
    }

    public IReadOnlyCollection<ActiveEdgeSession> GetActiveSessions() =>
        _sessions.Values.ToArray();

    public bool IsActive(string sessionId) =>
        _sessions.ContainsKey(sessionId.Trim());
}

public sealed class ActiveEdgeSession
{
    public required string SessionId { get; init; }

    public required string DomTarget { get; init; }

    public required string SubTarget { get; init; }

    public string? Mode { get; init; }

    public DateTimeOffset StartedAtUtc { get; init; }
}
