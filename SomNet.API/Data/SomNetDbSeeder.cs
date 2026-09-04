using SomNet.API.Data.Entities;
using SomNet.API.Services;
using SomNet.Shared.DTO.Notifications;
using SomNet.Shared.Enums;

namespace SomNet.API.Data;

public static class SomNetDbSeeder
{
    public static void SeedIfEmpty(SomNetDbContext db)
    {
        SeedUsers(db);

        if (db.Sessions.Any())
        {
            return;
        }

        db.Sessions.AddRange(
            Session("sess-001", "2026-09-04T13:15:00", "demo", "Slv66", OperationMode.Manual,
                "12 manual strokes, 2 bursts (5 strokes @ 5s delay), 1 abort."),
            Session("sess-002", "2026-09-03T20:42:00", "demo", "Slv66", OperationMode.Automatic,
                "Automatic session ran 38 minutes, 142 strokes, ended by stroke limit."),
            Session("sess-003", "2026-09-02T18:05:00", "demo", "Slv66", OperationMode.Manual,
                "8 manual strokes at 25–180 ms power range, no bursts."),
            Session("sess-004", "2026-09-03T11:20:00", "demo", "Slv67", OperationMode.Automatic,
                "Automatic session ran 22 minutes with bursts enabled (10%), stopped manually."),
            Session("sess-005", "2026-08-31T22:18:00", "demo", "Slv67", OperationMode.Manual,
                "5 manual strokes, 1 burst sequence, session aborted by operator."),
            Session("sess-006", "2026-09-01T09:30:00", "demo", "Slv68", OperationMode.Automatic,
                "Automatic session ran 15 minutes, sensitivity 65%, no auto-end."),
            Session("sess-007", "2026-08-30T16:45:00", "other-dom", "Slv66", OperationMode.Manual,
                "Session belonging to a different Dom — hidden from this pairing."));

        db.Notifications.AddRange(
            Notification("notify-001", "2026-09-04T09:12:00", "demo", "Slv66", "2026-09-04T13:15:00"),
            Notification("notify-002", "2026-09-03T14:30:00", "demo", "Slv66", "2026-09-03T20:42:00"),
            Notification("notify-003", "2026-09-02T10:05:00", "demo", "Slv66", "2026-09-02T18:05:00"),
            Notification("notify-004", "2026-09-05T08:00:00", "demo", "Slv66", "2026-09-06T19:00:00"),
            Notification("notify-005", "2026-09-03T08:45:00", "demo", "Slv67", "2026-09-03T11:20:00"),
            Notification("notify-006", "2026-08-31T16:20:00", "demo", "Slv67", "2026-08-31T22:18:00"),
            Notification("notify-007", "2026-09-01T07:15:00", "demo", "Slv68", "2026-09-01T09:30:00"),
            Notification("notify-008", "2026-08-30T12:00:00", "other-dom", "Slv66", "2026-08-30T16:45:00"));

        db.SaveChanges();
    }

    private static void SeedUsers(SomNetDbContext db)
    {
        if (db.Users.Any())
        {
            return;
        }

        var demoUser = new User
        {
            Username = "demo",
            DisplayName = "demo",
            PasswordHash = string.Empty,
        };

        demoUser.PasswordHash = AuthService.HashPassword(demoUser, "demo");

        db.Users.Add(demoUser);
        db.SaveChanges();
    }

    private static SessionHistoryEntry Session(
        string id,
        string startedAt,
        string domTarget,
        string subTarget,
        OperationMode mode,
        string summary) => new()
    {
        Id = id,
        StartedAt = DateTimeOffset.Parse(startedAt),
        DomTarget = domTarget,
        SubTarget = subTarget,
        Mode = mode,
        Summary = summary,
    };

    private static NotificationHistoryEntry Notification(
        string id,
        string sentAt,
        string domTarget,
        string subTarget,
        string sessionDateTime) => new()
    {
        Id = id,
        SentAt = DateTimeOffset.Parse(sentAt),
        DomTarget = domTarget,
        SubTarget = subTarget,
        Subject = NotificationConstants.DefaultSubject,
        SessionDateTime = DateTimeOffset.Parse(sessionDateTime),
    };
}
