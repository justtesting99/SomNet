using SomNet.Shared.Enums;

namespace SomNet.Shared.DTO.Modes;

/// <summary>Motor (H-bridge) automatic program (doc 31 / MA-R6).</summary>
public sealed class MotorAutomaticControlStateDto
{
    public bool Running { get; init; }

    public AutomaticRunMode AutomaticMode { get; init; } = AutomaticRunMode.Periodic;

    public int MinimumDutyPercent { get; init; }

    public int MaximumDutyPercent { get; init; } = 80;

    public int MinimumSpeedPercent { get; init; }

    public int MaximumSpeedPercent { get; init; } = 100;

    public int SegmentMinSeconds { get; init; } = 5;

    public int SegmentMaxSeconds { get; init; } = 20;

    public int DelayBeforeStartSeconds { get; init; }

    public int RampMs { get; init; } = 500;

    public EndSessionMode EndSessionMode { get; init; } = EndSessionMode.Minutes;

    public int EndSessionValue { get; init; } = 30;

    public bool BurstsOn { get; init; }

    public BurstPlacement BurstPlacement { get; init; } = BurstPlacement.SessionSpread;

    public int BurstPercent { get; init; } = 10;

    public BurstStyle BurstStyle { get; init; } = BurstStyle.FixedPowerDelay;

    public int BurstStrokePowerMin { get; init; }

    public int BurstStrokePowerMax { get; init; } = 100;

    public int BurstDelayMin { get; init; } = 1;

    public int BurstDelayMax { get; init; } = 5;

    public int BurstStrokesMin { get; init; } = 5;

    public int BurstStrokesMax { get; init; } = 10;

    public ActuatorKind ActuatorKind { get; init; } = ActuatorKind.Hbridge;
}
