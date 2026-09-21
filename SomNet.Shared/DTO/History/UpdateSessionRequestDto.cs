using SomNet.Shared.Enums;

namespace SomNet.Shared.DTO.History;

public sealed class UpdateSessionRequestDto
{
    public string? Summary { get; init; }

    public OperationMode? Mode { get; init; }
}
