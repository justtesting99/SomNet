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

    public DbSet<UserOptions> UserOptions => Set<UserOptions>();

    public DbSet<User> Users => Set<User>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SessionHistoryEntry>(entity =>
        {
            entity.ToTable("Sessions");
            entity.HasKey(session => session.Id);
            entity.Property(session => session.Id).HasMaxLength(32);
            entity.Property(session => session.DomTarget).HasMaxLength(128);
            entity.Property(session => session.Summary).HasMaxLength(2000);
            entity.HasIndex(session => new { session.DomTarget, session.SubTarget, session.StartedAt });
        });

        modelBuilder.Entity<NotificationHistoryEntry>(entity =>
        {
            entity.ToTable("Notifications");
            entity.HasKey(notification => notification.Id);
            entity.Property(notification => notification.Id).HasMaxLength(32);
            entity.Property(notification => notification.DomTarget).HasMaxLength(128);
            entity.Property(notification => notification.Subject).HasMaxLength(256);
            entity.HasIndex(notification => new { notification.DomTarget, notification.SubTarget, notification.SentAt });
        });

        modelBuilder.Entity<UserOptions>(entity =>
        {
            entity.ToTable("UserOptions");
            entity.HasKey(options => options.Username);
            entity.Property(options => options.Username).HasMaxLength(128);
            entity.Property(options => options.OperatorDisplayName).HasMaxLength(256);
            entity.Property(options => options.DefaultNotesPrefix).HasMaxLength(128);
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("Users");
            entity.HasKey(user => user.Username);
            entity.Property(user => user.Username).HasMaxLength(128);
            entity.Property(user => user.PasswordHash).HasMaxLength(512);
            entity.Property(user => user.DisplayName).HasMaxLength(256);
        });
    }
}
