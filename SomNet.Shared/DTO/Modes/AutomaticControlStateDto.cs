using SomNet.Shared.Enums;

namespace SomNet.Shared.DTO.Modes;

public sealed class AutomaticControlStateDto
{
    public bool Running { get; init; }

    public AutomaticRunMode AutomaticMode { get; init; } = AutomaticRunMode.RandomPowerAndTiming;

    public int MinimumPower { get; init; } = 25;

    public int MaximumPower { get; init; } = 400;

    public int StrokeMinSeconds { get; init; } = 5;

    public int StrokeMaxSeconds { get; init; } = 20;

    public int DelayBeforeStartSeconds { get; init; }

    public int EndSessionValue { get; init; } = 100;

    public EndSessionMode EndSessionMode { get; init; } = EndSessionMode.NoAutoEnd;

    public bool BurstsOn { get; init; }

    public int BurstPercent { get; init; } = 10;

    public BurstStyle BurstStyle { get; init; } = BurstStyle.FixedPowerDelay;

    public int BurstStrokePowerMin { get; init; }

    public int BurstStrokePowerMax { get; init; } = 100;

    public int BurstDelayMin { get; init; } = 1;

    public int BurstDelayMax { get; init; } = 5;

    public int BurstStrokesMin { get; init; } = 5;

    public int BurstStrokesMax { get; init; } = 10;
}
