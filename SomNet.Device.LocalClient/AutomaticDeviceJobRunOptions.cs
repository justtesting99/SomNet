namespace SomNet.Device.LocalClient;

public sealed class AutomaticDeviceJobRunOptions
{
    public TimeSpan WaitTimeout { get; init; } = TimeSpan.FromHours(2);

    public bool DisarmAfterRun { get; init; } = true;

    public bool LockAfterRun { get; init; }

    public bool ArmBeforeStart { get; init; } = true;
}
