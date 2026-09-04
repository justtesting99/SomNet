using Microsoft.EntityFrameworkCore;
using SomNet.API.Data;
using SomNet.API.Data.Entities;
using SomNet.Shared.DTO.History;
using SomNet.Shared.DTO.Notifications;
using SomNet.Shared.DTO.Settings;
using SomNet.Shared.Models;

namespace SomNet.API.Services;

public sealed class SomNetDataStore : ISomNetDataStore
{
    private readonly SomNetDbContext _db;

    public SomNetDataStore(SomNetDbContext db)
    {
        _db = db;
    }

    public IReadOnlyList<SessionHistoryEntryDto> GetSessionsForDom(string domTarget, string? subTarget = null)
    {
        IQueryable<SessionHistoryEntry> query = _db.Sessions
            .AsNoTracking()
            .Where(session => session.DomTarget == domTarget);

        if (!string.IsNullOrWhiteSpace(subTarget))
        {
            var normalizedSub = SubTargetValidation.Normalize(subTarget);
            query = query.Where(session => session.SubTarget == normalizedSub);
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

        var normalizedSub = SubTargetValidation.Normalize(query.SubTarget);
        var notifications = _db.Notifications
            .AsNoTracking()
            .Where(notification =>
                notification.DomTarget == query.DomTarget &&
                notification.SubTarget == normalizedSub)
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

    public IReadOnlyList<string> GetSubsUnderDom(string domTarget)
    {
        if (string.IsNullOrWhiteSpace(domTarget))
        {
            return [];
        }

        var key = domTarget.Trim();
        var excluded = _db.DomSubExclusions
            .AsNoTracking()
            .Where(exclusion => exclusion.DomTarget == key)
            .Select(exclusion => exclusion.SubName)
            .ToHashSet();

        return _db.DomSubAssignments
            .AsNoTracking()
            .Where(assignment => assignment.DomTarget == key)
            .Select(assignment => assignment.SubName)
            .Union(_db.Sessions
                .AsNoTracking()
                .Where(session => session.DomTarget == key)
                .Select(session => session.SubTarget))
            .Union(_db.Notifications
                .AsNoTracking()
                .Where(notification => notification.DomTarget == key)
                .Select(notification => notification.SubTarget))
            .Where(sub => !excluded.Contains(sub))
            .OrderBy(sub => sub)
            .ToList();
    }

    public IReadOnlyList<string> AddDomSub(string domTarget, string subName)
    {
        if (string.IsNullOrWhiteSpace(domTarget))
        {
            throw new ArgumentException("DomTarget is required.", nameof(domTarget));
        }

        var validationError = SubTargetValidation.Validate(subName);
        if (validationError is not null)
        {
            throw new ArgumentException(validationError, nameof(subName));
        }

        var key = domTarget.Trim();
        var normalizedSub = SubTargetValidation.Normalize(subName);

        var exists = _db.DomSubAssignments.Any(assignment =>
            assignment.DomTarget == key &&
            assignment.SubName == normalizedSub);

        if (exists)
        {
            throw new InvalidOperationException($"Sub '{normalizedSub}' is already assigned to this Dom.");
        }

        var exclusion = _db.DomSubExclusions.SingleOrDefault(entry =>
            entry.DomTarget == key &&
            entry.SubName == normalizedSub);

        if (exclusion is not null)
        {
            _db.DomSubExclusions.Remove(exclusion);
        }

        _db.DomSubAssignments.Add(new DomSubAssignment
        {
            DomTarget = key,
            SubName = normalizedSub,
        });
        _db.SaveChanges();

        return GetSubsUnderDom(key);
    }

    public IReadOnlyList<string> RemoveDomSub(string domTarget, string subName)
    {
        if (string.IsNullOrWhiteSpace(domTarget))
        {
            throw new ArgumentException("DomTarget is required.", nameof(domTarget));
        }

        var validationError = SubTargetValidation.Validate(subName);
        if (validationError is not null)
        {
            throw new ArgumentException(validationError, nameof(subName));
        }

        var key = domTarget.Trim();
        var normalizedSub = SubTargetValidation.Normalize(subName);

        var assignment = _db.DomSubAssignments.SingleOrDefault(entry =>
            entry.DomTarget == key &&
            entry.SubName == normalizedSub);

        if (assignment is not null)
        {
            _db.DomSubAssignments.Remove(assignment);
        }

        var settings = _db.DomSubSettings.SingleOrDefault(entry =>
            entry.DomTarget == key &&
            entry.SubName == normalizedSub);

        if (settings is not null)
        {
            _db.DomSubSettings.Remove(settings);
        }

        var alreadyExcluded = _db.DomSubExclusions.Any(entry =>
            entry.DomTarget == key &&
            entry.SubName == normalizedSub);

        if (!alreadyExcluded)
        {
            _db.DomSubExclusions.Add(new DomSubExclusion
            {
                DomTarget = key,
                SubName = normalizedSub,
            });
        }

        _db.SaveChanges();

        return GetSubsUnderDom(key);
    }

    public NotificationHistoryEntryDto AddNotification(SendSessionNotificationRequestDto request)
    {
        var nextSequence = GetNextNotificationSequence();
        var notification = new NotificationHistoryEntry
        {
            Id = $"notify-{nextSequence:D3}",
            SentAt = DateTimeOffset.Now,
            DomTarget = request.DomTarget.Trim(),
            SubTarget = SubTargetValidation.Normalize(request.SubTarget),
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
            SubTarget = SubTargetValidation.Normalize(request.SubTarget),
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

    public PairingSettingsDto GetPairingSettings(string domTarget, string subTarget)
    {
        if (string.IsNullOrWhiteSpace(domTarget))
        {
            return PairingSettingsDefaults.Value;
        }

        var normalizedSub = SubTargetValidation.Normalize(subTarget);
        var entity = _db.DomSubSettings
            .AsNoTracking()
            .SingleOrDefault(entry =>
                entry.DomTarget == domTarget.Trim() &&
                entry.SubName == normalizedSub);

        return entity is null
            ? PairingSettingsDefaults.Value
            : PairingSettingsSerializer.Deserialize(entity.SettingsJson);
    }

    public PairingSettingsDto SavePairingSettings(
        string domTarget,
        string subTarget,
        PairingSettingsDto settings)
    {
        if (string.IsNullOrWhiteSpace(domTarget))
        {
            throw new ArgumentException("DomTarget is required.", nameof(domTarget));
        }

        var normalizedSub = SubTargetValidation.Normalize(subTarget);
        var normalized = PairingSettingsSerializer.Normalize(settings);
        var key = domTarget.Trim();
        var entity = _db.DomSubSettings.SingleOrDefault(entry =>
            entry.DomTarget == key &&
            entry.SubName == normalizedSub);

        if (entity is null)
        {
            entity = new DomSubSettings
            {
                DomTarget = key,
                SubName = normalizedSub,
                SettingsJson = string.Empty,
            };
            _db.DomSubSettings.Add(entity);
        }

        entity.SettingsJson = PairingSettingsSerializer.Serialize(normalized);
        _db.SaveChanges();

        return normalized;
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
}
