using SomNet.Shared.Enums;

namespace SomNet.Shared.DTO.Notifications;

public sealed class SendSessionNotificationRequestDto
{
    public required string DomTarget { get; init; }

    public required string SubTarget { get; init; }

    public string Subject { get; init; } = "Upcoming Session";

    public required DateTimeOffset SessionDateTime { get; init; }

    public string CustomBody { get; init; } = string.Empty;
}
