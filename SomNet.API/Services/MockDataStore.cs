using SomNet.Shared.DTO.History;
using SomNet.Shared.DTO.Notifications;
using SomNet.Shared.DTO.Options;
using SomNet.Shared.Enums;
using SomNet.Shared.Models;

namespace SomNet.API.Services;

public sealed class MockDataStore : IMockDataStore
{
    private readonly List<SessionHistoryEntryDto> _sessions;
    private readonly List<NotificationHistoryEntryDto> _notifications;
    private readonly Dictionary<string, AppOptionsDto> _optionsByUser = new(StringComparer.OrdinalIgnoreCase);
    private int _notificationSequence;

    public MockDataStore()
    {
        _sessions = SeedSessions();
        _notifications = SeedNotifications();
        _notificationSequence = _notifications.Count;
    }

    public IReadOnlyList<SessionHistoryEntryDto> GetSessionsForDom(string domTarget, SubTargetName? subTarget = null)
    {
        IEnumerable<SessionHistoryEntryDto> query = _sessions.Where(session =>
            string.Equals(session.DomTarget, domTarget, StringComparison.OrdinalIgnoreCase));

        if (subTarget is not null)
        {
            query = query.Where(session => session.SubTarget == subTarget);
        }

        return query
            .OrderByDescending(session => session.StartedAt)
            .ToList();
    }

    public IReadOnlyList<HistoryTimelineItemDto> GetTimeline(HistoryQueryDto query)
    {
        if (query.FromDate is not null && query.ToDate is not null && query.FromDate > query.ToDate)
        {
            throw new ArgumentException("FromDate must be on or before ToDate.");
        }

        var sessions = GetSessionsForDom(query.DomTarget, query.SubTarget)
            .Select(session => (HistoryTimelineItemDto)new SessionHistoryTimelineItemDto { Entry = session });

        var notifications = _notifications
            .Where(notification =>
                string.Equals(notification.DomTarget, query.DomTarget, StringComparison.OrdinalIgnoreCase) &&
                notification.SubTarget == query.SubTarget)
            .Select(notification => (HistoryTimelineItemDto)new NotificationHistoryTimelineItemDto
            {
                Entry = notification,
            });

        return sessions
            .Concat(notifications)
            .Where(item => IsWithinDateRange(item, query.FromDate, query.ToDate))
            .OrderByDescending(GetTimelineSortTime)
            .ToList();
    }

    public IReadOnlyList<SubTargetName> GetSubsUnderDom(string domTarget)
    {
        var subs = new HashSet<SubTargetName>();

        foreach (var session in _sessions)
        {
            if (string.Equals(session.DomTarget, domTarget, StringComparison.OrdinalIgnoreCase))
            {
                subs.Add(session.SubTarget);
            }
        }

        foreach (var notification in _notifications)
        {
            if (string.Equals(notification.DomTarget, domTarget, StringComparison.OrdinalIgnoreCase))
            {
                subs.Add(notification.SubTarget);
            }
        }

        if (subs.Count == 0)
        {
            return SessionUserConstants.AvailableSubs
                .Select(ParseSubTarget)
                .ToList();
        }

        return subs.OrderBy(sub => sub.ToString()).ToList();
    }

    public NotificationHistoryEntryDto AddNotification(SendSessionNotificationRequestDto request)
    {
        _notificationSequence += 1;

        var notification = new NotificationHistoryEntryDto
        {
            Id = $"notify-{_notificationSequence:D3}",
            SentAt = DateTimeOffset.Now,
            DomTarget = request.DomTarget.Trim(),
            SubTarget = request.SubTarget,
            Subject = string.IsNullOrWhiteSpace(request.Subject)
                ? NotificationConstants.DefaultSubject
                : request.Subject.Trim(),
            SessionDateTime = request.SessionDateTime,
        };

        _notifications.Add(notification);
        return notification;
    }

    public AppOptionsDto GetOptions(string username)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return AppOptionsDefaults.Value;
        }

        return _optionsByUser.TryGetValue(username.Trim(), out var options)
            ? options
            : AppOptionsDefaults.Value;
    }

    public AppOptionsDto SaveOptions(string username, AppOptionsDto options)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            throw new ArgumentException("Username is required.", nameof(username));
        }

        _optionsByUser[username.Trim()] = options;
        return options;
    }

    private static bool IsWithinDateRange(HistoryTimelineItemDto item, DateOnly? fromDate, DateOnly? toDate)
    {
        var dateKey = GetTimelineDateKey(item);

        if (fromDate is not null && dateKey < fromDate)
        {
            return false;
        }

        if (toDate is not null && dateKey > toDate)
        {
            return false;
        }

        return true;
    }

    private static DateOnly GetTimelineDateKey(HistoryTimelineItemDto item) => item switch
    {
        SessionHistoryTimelineItemDto session => DateOnly.FromDateTime(session.Entry.StartedAt.DateTime),
        NotificationHistoryTimelineItemDto notification => DateOnly.FromDateTime(notification.Entry.SentAt.DateTime),
        _ => throw new InvalidOperationException("Unknown timeline item type."),
    };

    private static DateTimeOffset GetTimelineSortTime(HistoryTimelineItemDto item) => item switch
    {
        SessionHistoryTimelineItemDto session => session.Entry.StartedAt,
        NotificationHistoryTimelineItemDto notification => notification.Entry.SentAt,
        _ => throw new InvalidOperationException("Unknown timeline item type."),
    };

    private static SubTargetName ParseSubTarget(string value) => value switch
    {
        "Slv66" => SubTargetName.Slv66,
        "Slv67" => SubTargetName.Slv67,
        "Slv68" => SubTargetName.Slv68,
        _ => throw new ArgumentOutOfRangeException(nameof(value), value, "Unknown sub target."),
    };

    private static List<SessionHistoryEntryDto> SeedSessions() =>
    [
        new()
        {
            Id = "sess-001",
            StartedAt = ParseOffset("2026-09-04T13:15:00"),
            DomTarget = "demo",
            SubTarget = SubTargetName.Slv66,
            Mode = OperationMode.Manual,
            Summary = "12 manual strokes, 2 bursts (5 strokes @ 5s delay), 1 abort.",
        },
        new()
        {
            Id = "sess-002",
            StartedAt = ParseOffset("2026-09-03T20:42:00"),
            DomTarget = "demo",
            SubTarget = SubTargetName.Slv66,
            Mode = OperationMode.Automatic,
            Summary = "Automatic session ran 38 minutes, 142 strokes, ended by stroke limit.",
        },
        new()
        {
            Id = "sess-003",
            StartedAt = ParseOffset("2026-09-02T18:05:00"),
            DomTarget = "demo",
            SubTarget = SubTargetName.Slv66,
            Mode = OperationMode.Manual,
            Summary = "8 manual strokes at 25–180 ms power range, no bursts.",
        },
        new()
        {
            Id = "sess-004",
            StartedAt = ParseOffset("2026-09-03T11:20:00"),
            DomTarget = "demo",
            SubTarget = SubTargetName.Slv67,
            Mode = OperationMode.Automatic,
            Summary = "Automatic session ran 22 minutes with bursts enabled (10%), stopped manually.",
        },
        new()
        {
            Id = "sess-005",
            StartedAt = ParseOffset("2026-08-31T22:18:00"),
            DomTarget = "demo",
            SubTarget = SubTargetName.Slv67,
            Mode = OperationMode.Manual,
            Summary = "5 manual strokes, 1 burst sequence, session aborted by operator.",
        },
        new()
        {
            Id = "sess-006",
            StartedAt = ParseOffset("2026-09-01T09:30:00"),
            DomTarget = "demo",
            SubTarget = SubTargetName.Slv68,
            Mode = OperationMode.Automatic,
            Summary = "Automatic session ran 15 minutes, sensitivity 65%, no auto-end.",
        },
        new()
        {
            Id = "sess-007",
            StartedAt = ParseOffset("2026-08-30T16:45:00"),
            DomTarget = "other-dom",
            SubTarget = SubTargetName.Slv66,
            Mode = OperationMode.Manual,
            Summary = "Session belonging to a different Dom — hidden from this pairing.",
        },
    ];

    private static List<NotificationHistoryEntryDto> SeedNotifications() =>
    [
        new()
        {
            Id = "notify-001",
            SentAt = ParseOffset("2026-09-04T09:12:00"),
            DomTarget = "demo",
            SubTarget = SubTargetName.Slv66,
            Subject = NotificationConstants.DefaultSubject,
            SessionDateTime = ParseOffset("2026-09-04T13:15:00"),
        },
        new()
        {
            Id = "notify-002",
            SentAt = ParseOffset("2026-09-03T14:30:00"),
            DomTarget = "demo",
            SubTarget = SubTargetName.Slv66,
            Subject = NotificationConstants.DefaultSubject,
            SessionDateTime = ParseOffset("2026-09-03T20:42:00"),
        },
        new()
        {
            Id = "notify-003",
            SentAt = ParseOffset("2026-09-02T10:05:00"),
            DomTarget = "demo",
            SubTarget = SubTargetName.Slv66,
            Subject = NotificationConstants.DefaultSubject,
            SessionDateTime = ParseOffset("2026-09-02T18:05:00"),
        },
        new()
        {
            Id = "notify-004",
            SentAt = ParseOffset("2026-09-05T08:00:00"),
            DomTarget = "demo",
            SubTarget = SubTargetName.Slv66,
            Subject = NotificationConstants.DefaultSubject,
            SessionDateTime = ParseOffset("2026-09-06T19:00:00"),
        },
        new()
        {
            Id = "notify-005",
            SentAt = ParseOffset("2026-09-03T08:45:00"),
            DomTarget = "demo",
            SubTarget = SubTargetName.Slv67,
            Subject = NotificationConstants.DefaultSubject,
            SessionDateTime = ParseOffset("2026-09-03T11:20:00"),
        },
        new()
        {
            Id = "notify-006",
            SentAt = ParseOffset("2026-08-31T16:20:00"),
            DomTarget = "demo",
            SubTarget = SubTargetName.Slv67,
            Subject = NotificationConstants.DefaultSubject,
            SessionDateTime = ParseOffset("2026-08-31T22:18:00"),
        },
        new()
        {
            Id = "notify-007",
            SentAt = ParseOffset("2026-09-01T07:15:00"),
            DomTarget = "demo",
            SubTarget = SubTargetName.Slv68,
            Subject = NotificationConstants.DefaultSubject,
            SessionDateTime = ParseOffset("2026-09-01T09:30:00"),
        },
        new()
        {
            Id = "notify-008",
            SentAt = ParseOffset("2026-08-30T12:00:00"),
            DomTarget = "other-dom",
            SubTarget = SubTargetName.Slv66,
            Subject = NotificationConstants.DefaultSubject,
            SessionDateTime = ParseOffset("2026-08-30T16:45:00"),
        },
    ];

    private static DateTimeOffset ParseOffset(string value) => DateTimeOffset.Parse(value);
}
