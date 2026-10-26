using SomNet.Shared.Enums;

namespace SomNet.Shared.DTO.Modes;

/// <summary>Motor (H-bridge) automatic program — periodic v1 (doc 31 / MA-R6).</summary>
public sealed class MotorAutomaticControlStateDto
{
    public bool Running { get; init; }

    public string AutomaticMode { get; init; } = "periodic";

    public int MinimumDutyPercent { get; init; }

    public int MaximumDutyPercent { get; init; } = 80;

    public int SegmentMinSeconds { get; init; } = 5;

    public int SegmentMaxSeconds { get; init; } = 20;

    public int DelayBeforeStartSeconds { get; init; }

    public int RampMs { get; init; } = 500;

    public EndSessionMode EndSessionMode { get; init; } = EndSessionMode.NoAutoEnd;

    public int EndSessionValue { get; init; } = 30;

    public ActuatorKind ActuatorKind { get; init; } = ActuatorKind.Hbridge;
}
