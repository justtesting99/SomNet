namespace SomNet.Shared.Enums;

public enum AutomaticRunMode
{
    Periodic,
    RandomPowerOnly,
    /// <summary>Motor automatic: random speed between min and max (continuous waveform).</summary>
    RandomSpeed,
    /// <summary>Motor automatic: random speed and random segment interval.</summary>
    RandomSpeedAndTiming,
    RandomTimingOnly,
    RandomPowerAndTiming,
    PowerWave,
    PowerAndTimingWave,
    BuildUp,
}
