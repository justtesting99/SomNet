namespace SomNet.Shared.DTO.Notifications;

public sealed class SessionNotificationFormDto
{
    public string Subject { get; init; } = "Upcoming Session";

    public required DateTimeOffset SessionDateTime { get; init; }

    public string CustomBody { get; init; } = string.Empty;
}
