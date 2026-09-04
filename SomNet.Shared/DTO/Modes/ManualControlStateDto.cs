namespace SomNet.Shared.DTO.Modes;

public sealed class ManualControlStateDto
{
    public int MinimumStrokeMs { get; init; } = 25;

    public int MaximumStrokeMs { get; init; } = 400;

    public int PowerPercent { get; init; }

    public int BurstStrokes { get; init; } = 5;

    public int BurstDelaySeconds { get; init; } = 5;
}
