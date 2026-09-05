using Microsoft.EntityFrameworkCore;
using SomNet.API.Data.Entities;

namespace SomNet.API.Data;

public sealed class SomNetDbContext : DbContext
{
    public SomNetDbContext(DbContextOptions<SomNetDbContext> options)
        : base(options)
    {
    }

    public DbSet<SessionHistoryEntry> Sessions => Set<SessionHistoryEntry>();

    public DbSet<NotificationHistoryEntry> Notifications => Set<NotificationHistoryEntry>();

    public DbSet<DomSubSettings> DomSubSettings => Set<DomSubSettings>();

    public DbSet<DomSubAssignment> DomSubAssignments => Set<DomSubAssignment>();

    public DbSet<DomSubExclusion> DomSubExclusions => Set<DomSubExclusion>();

    public DbSet<User> Users => Set<User>();

    public DbSet<SubDeviceRegistration> SubDeviceRegistrations => Set<SubDeviceRegistration>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SessionHistoryEntry>(entity =>
        {
            entity.ToTable("Sessions");
            entity.HasKey(session => session.Id);
            entity.Property(session => session.Id).HasMaxLength(32);
            entity.Property(session => session.DomTarget).HasMaxLength(128);
            entity.Property(session => session.SubTarget).HasMaxLength(32);
            entity.Property(session => session.Summary).HasMaxLength(2000);
            entity.HasIndex(session => new { session.DomTarget, session.SubTarget, session.StartedAt });
        });

        modelBuilder.Entity<NotificationHistoryEntry>(entity =>
        {
            entity.ToTable("Notifications");
            entity.HasKey(notification => notification.Id);
            entity.Property(notification => notification.Id).HasMaxLength(32);
            entity.Property(notification => notification.DomTarget).HasMaxLength(128);
            entity.Property(notification => notification.SubTarget).HasMaxLength(32);
            entity.Property(notification => notification.Subject).HasMaxLength(256);
            entity.HasIndex(notification => new { notification.DomTarget, notification.SubTarget, notification.SentAt });
        });

        modelBuilder.Entity<DomSubSettings>(entity =>
        {
            entity.ToTable("DomSubSettings");
            entity.HasKey(settings => new { settings.DomTarget, settings.SubName });
            entity.Property(settings => settings.DomTarget).HasMaxLength(128);
            entity.Property(settings => settings.SubName).HasMaxLength(32);
            entity.Property(settings => settings.SettingsJson).HasMaxLength(8000);
        });

        modelBuilder.Entity<DomSubAssignment>(entity =>
        {
            entity.ToTable("DomSubAssignments");
            entity.HasKey(assignment => new { assignment.DomTarget, assignment.SubName });
            entity.Property(assignment => assignment.DomTarget).HasMaxLength(128);
            entity.Property(assignment => assignment.SubName).HasMaxLength(32);
        });

        modelBuilder.Entity<DomSubExclusion>(entity =>
        {
            entity.ToTable("DomSubExclusions");
            entity.HasKey(exclusion => new { exclusion.DomTarget, exclusion.SubName });
            entity.Property(exclusion => exclusion.DomTarget).HasMaxLength(128);
            entity.Property(exclusion => exclusion.SubName).HasMaxLength(32);
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("Users");
            entity.HasKey(user => user.Username);
            entity.Property(user => user.Username).HasMaxLength(128);
            entity.Property(user => user.PasswordHash).HasMaxLength(512);
            entity.Property(user => user.DisplayName).HasMaxLength(256);
        });

        modelBuilder.Entity<SubDeviceRegistration>(entity =>
        {
            entity.ToTable("SubDeviceRegistrations");
            entity.HasKey(registration => new { registration.DomTarget, registration.SubName });
            entity.Property(registration => registration.DomTarget).HasMaxLength(128);
            entity.Property(registration => registration.SubName).HasMaxLength(32);
            entity.Property(registration => registration.DeviceId).HasMaxLength(64);
            entity.Property(registration => registration.AccessToken).HasMaxLength(2048);
            entity.Property(registration => registration.TokenJti).HasMaxLength(64);
            entity.HasIndex(registration => registration.DeviceId);
        });
    }
}
