namespace SomNet.Shared.DTO.Modes;

public sealed class MotorManualControlStateDto
{
    public int MinimumDutyPercent { get; init; } = 20;

    public int MaximumDutyPercent { get; init; } = 80;

    public int SpeedPercent { get; init; }
}
