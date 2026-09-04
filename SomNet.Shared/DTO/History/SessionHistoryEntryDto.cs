using SomNet.Shared.Enums;

namespace SomNet.Shared.DTO.History;

public sealed class SessionHistoryEntryDto
{
    public required string Id { get; init; }

    public required DateTimeOffset StartedAt { get; init; }

    public required string DomTarget { get; init; }

    public required string SubTarget { get; init; }

    public OperationMode Mode { get; init; }

    public required string Summary { get; init; }
}
