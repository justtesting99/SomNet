using Microsoft.EntityFrameworkCore;
using SomNet.API.Data;
using SomNet.API.Data.Entities;
using SomNet.Shared.DTO.History;
using SomNet.Shared.DTO.Notifications;
using SomNet.Shared.DTO.Options;
using SomNet.Shared.Enums;
using SomNet.Shared.Models;

namespace SomNet.API.Services;

public sealed class SomNetDataStore : ISomNetDataStore
{
    private readonly SomNetDbContext _db;

    public SomNetDataStore(SomNetDbContext db)
    {
        _db = db;
    }

    public IReadOnlyList<SessionHistoryEntryDto> GetSessionsForDom(string domTarget, SubTargetName? subTarget = null)
    {
        IQueryable<SessionHistoryEntry> query = _db.Sessions
            .AsNoTracking()
            .Where(session => session.DomTarget == domTarget);

        if (subTarget is not null)
        {
            query = query.Where(session => session.SubTarget == subTarget);
        }

        return query
            .OrderByDescending(session => session.StartedAt)
            .AsEnumerable()
            .Select(ToDto)
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

        var notifications = _db.Notifications
            .AsNoTracking()
            .Where(notification =>
                notification.DomTarget == query.DomTarget &&
                notification.SubTarget == query.SubTarget)
            .AsEnumerable()
            .Select(notification => (HistoryTimelineItemDto)new NotificationHistoryTimelineItemDto
            {
                Entry = ToDto(notification),
            });

        return sessions
            .Concat(notifications)
            .Where(item => IsWithinDateRange(item, query.FromDate, query.ToDate))
            .OrderByDescending(GetTimelineSortTime)
            .ToList();
    }

    public IReadOnlyList<SubTargetName> GetSubsUnderDom(string domTarget)
    {
        var subs = _db.Sessions
            .AsNoTracking()
            .Where(session => session.DomTarget == domTarget)
            .Select(session => session.SubTarget)
            .Union(_db.Notifications
                .AsNoTracking()
                .Where(notification => notification.DomTarget == domTarget)
                .Select(notification => notification.SubTarget))
            .OrderBy(sub => sub)
            .ToList();

        if (subs.Count == 0)
        {
            return SessionUserConstants.AvailableSubs
                .Select(ParseSubTarget)
                .ToList();
        }

        return subs;
    }

    public NotificationHistoryEntryDto AddNotification(SendSessionNotificationRequestDto request)
    {
        var nextSequence = GetNextNotificationSequence();
        var notification = new NotificationHistoryEntry
        {
            Id = $"notify-{nextSequence:D3}",
            SentAt = DateTimeOffset.Now,
            DomTarget = request.DomTarget.Trim(),
            SubTarget = request.SubTarget,
            Subject = string.IsNullOrWhiteSpace(request.Subject)
                ? NotificationConstants.DefaultSubject
                : request.Subject.Trim(),
            SessionDateTime = request.SessionDateTime,
        };

        _db.Notifications.Add(notification);
        _db.SaveChanges();

        return ToDto(notification);
    }

    public SessionHistoryEntryDto StartSession(string domTarget, StartSessionRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(domTarget))
        {
            throw new ArgumentException("DomTarget is required.", nameof(domTarget));
        }

        var session = new SessionHistoryEntry
        {
            Id = $"sess-{GetNextSessionSequence():D3}",
            StartedAt = DateTimeOffset.Now,
            DomTarget = domTarget.Trim(),
            SubTarget = request.SubTarget,
            Mode = request.Mode,
            Summary = "In progress",
        };

        _db.Sessions.Add(session);
        _db.SaveChanges();

        return ToDto(session);
    }

    public SessionHistoryEntryDto UpdateSession(string domTarget, string sessionId, UpdateSessionRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(domTarget))
        {
            throw new ArgumentException("DomTarget is required.", nameof(domTarget));
        }

        if (string.IsNullOrWhiteSpace(sessionId))
        {
            throw new ArgumentException("Session id is required.", nameof(sessionId));
        }

        if (string.IsNullOrWhiteSpace(request.Summary))
        {
            throw new ArgumentException("Summary is required.", nameof(request));
        }

        var session = _db.Sessions.SingleOrDefault(entry =>
            entry.Id == sessionId.Trim() &&
            entry.DomTarget == domTarget.Trim());

        if (session is null)
        {
            throw new KeyNotFoundException($"Session '{sessionId}' was not found for this operator.");
        }

        session.Summary = request.Summary.Trim();
        _db.SaveChanges();

        return ToDto(session);
    }

    public SessionHistoryEntryDto EndSession(string domTarget, string sessionId, EndSessionRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(domTarget))
        {
            throw new ArgumentException("DomTarget is required.", nameof(domTarget));
        }

        if (string.IsNullOrWhiteSpace(sessionId))
        {
            throw new ArgumentException("Session id is required.", nameof(sessionId));
        }

        if (string.IsNullOrWhiteSpace(request.Summary))
        {
            throw new ArgumentException("Summary is required.", nameof(request));
        }

        var session = _db.Sessions.SingleOrDefault(entry =>
            entry.Id == sessionId.Trim() &&
            entry.DomTarget == domTarget.Trim());

        if (session is null)
        {
            throw new KeyNotFoundException($"Session '{sessionId}' was not found for this operator.");
        }

        session.Summary = request.Summary.Trim();
        _db.SaveChanges();

        return ToDto(session);
    }

    public AppOptionsDto GetOptions(string username)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return AppOptionsDefaults.Value;
        }

        var options = _db.UserOptions
            .AsNoTracking()
            .SingleOrDefault(entry => entry.Username == username.Trim());

        return options is null ? AppOptionsDefaults.Value : ToDto(options);
    }

    public AppOptionsDto SaveOptions(string username, AppOptionsDto options)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            throw new ArgumentException("Username is required.", nameof(username));
        }

        var key = username.Trim();
        var entity = _db.UserOptions.SingleOrDefault(entry => entry.Username == key);

        if (entity is null)
        {
            entity = new UserOptions { Username = key };
            _db.UserOptions.Add(entity);
        }

        ApplyOptions(entity, options);
        _db.SaveChanges();

        return ToDto(entity);
    }

    private int GetNextNotificationSequence()
    {
        var maxSequence = _db.Notifications
            .AsNoTracking()
            .Select(notification => notification.Id)
            .AsEnumerable()
            .Select(ParseNotificationSequence)
            .DefaultIfEmpty(0)
            .Max();

        return maxSequence + 1;
    }

    private static int ParseNotificationSequence(string id)
    {
        if (!id.StartsWith("notify-", StringComparison.OrdinalIgnoreCase))
        {
            return 0;
        }

        return int.TryParse(id["notify-".Length..], out var sequence) ? sequence : 0;
    }

    private int GetNextSessionSequence()
    {
        var maxSequence = _db.Sessions
            .AsNoTracking()
            .Select(session => session.Id)
            .AsEnumerable()
            .Select(ParseSessionSequence)
            .DefaultIfEmpty(0)
            .Max();

        return maxSequence + 1;
    }

    private static int ParseSessionSequence(string id)
    {
        if (!id.StartsWith("sess-", StringComparison.OrdinalIgnoreCase))
        {
            return 0;
        }

        return int.TryParse(id["sess-".Length..], out var sequence) ? sequence : 0;
    }

    private static SessionHistoryEntryDto ToDto(SessionHistoryEntry session) => new()
    {
        Id = session.Id,
        StartedAt = session.StartedAt,
        DomTarget = session.DomTarget,
        SubTarget = session.SubTarget,
        Mode = session.Mode,
        Summary = session.Summary,
    };

    private static NotificationHistoryEntryDto ToDto(NotificationHistoryEntry notification) => new()
    {
        Id = notification.Id,
        SentAt = notification.SentAt,
        DomTarget = notification.DomTarget,
        SubTarget = notification.SubTarget,
        Subject = notification.Subject,
        SessionDateTime = notification.SessionDateTime,
    };

    private static AppOptionsDto ToDto(UserOptions options) => new()
    {
        EnableSoundAlerts = options.EnableSoundAlerts,
        ConfirmBeforeCommands = options.ConfirmBeforeCommands,
        AutoExpandVideoOnMobile = options.AutoExpandVideoOnMobile,
        MobileVideoExpandDefault = options.MobileVideoExpandDefault,
        ShowSessionTimestamps = options.ShowSessionTimestamps,
        OperatorDisplayName = options.OperatorDisplayName,
        DefaultNotesPrefix = options.DefaultNotesPrefix,
        ReconnectIntervalSeconds = options.ReconnectIntervalSeconds,
    };

    private static void ApplyOptions(UserOptions entity, AppOptionsDto options)
    {
        entity.EnableSoundAlerts = options.EnableSoundAlerts;
        entity.ConfirmBeforeCommands = options.ConfirmBeforeCommands;
        entity.AutoExpandVideoOnMobile = options.AutoExpandVideoOnMobile;
        entity.MobileVideoExpandDefault = options.MobileVideoExpandDefault;
        entity.ShowSessionTimestamps = options.ShowSessionTimestamps;
        entity.OperatorDisplayName = options.OperatorDisplayName;
        entity.DefaultNotesPrefix = options.DefaultNotesPrefix;
        entity.ReconnectIntervalSeconds = options.ReconnectIntervalSeconds;
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
}
