namespace SomNet.Shared.DTO.Modes;

public static class ControlStateDefaults
{
    public static ManualControlStateDto Manual { get; } = new()
    {
        MinimumStrokeMs = 25,
        MaximumStrokeMs = 400,
        PowerPercent = 0,
        BurstStrokes = 5,
        BurstDelaySeconds = 5,
    };

    public static AutomaticControlStateDto Automatic { get; } = new()
    {
        Running = false,
        AutomaticMode = Enums.AutomaticRunMode.RandomPowerAndTiming,
        MinimumPower = 25,
        MaximumPower = 400,
        StrokeMinSeconds = 5,
        StrokeMaxSeconds = 20,
        DelayBeforeStartSeconds = 0,
        EndSessionValue = 100,
        EndSessionMode = Enums.EndSessionMode.NoAutoEnd,
        BurstsOn = false,
        BurstPercent = 10,
        BurstStyle = Enums.BurstStyle.FixedPowerDelay,
        BurstStrokePowerMin = 0,
        BurstStrokePowerMax = 100,
        BurstDelayMin = 1,
        BurstDelayMax = 5,
        BurstStrokesMin = 5,
        BurstStrokesMax = 10,
    };
}
