namespace SomNet.Shared.DTO.Modes;

public sealed class MotorManualControlStateDto
{
    public int MinimumDutyPercent { get; init; } = 20;

    public int MaximumDutyPercent { get; init; } = 80;

    public int MinimumRunSeconds { get; init; } = 2;

    public int MaximumRunSeconds { get; init; } = 15;

    public int SpeedPercent { get; init; }
}
