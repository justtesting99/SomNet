using SomNet.Shared.Enums;

namespace SomNet.Shared.DTO.History;

public sealed class StartSessionRequestDto
{
    public SubTargetName SubTarget { get; init; }

    public OperationMode Mode { get; init; }
}
