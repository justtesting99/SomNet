using SomNet.Shared.DTO.History;

namespace SomNet.Shared.DTO.Notifications;

public sealed class SendSessionNotificationResponseDto
{
    public required NotificationHistoryEntryDto Notification { get; init; }

    public string Message { get; init; } = "Notification queued for delivery.";
}
