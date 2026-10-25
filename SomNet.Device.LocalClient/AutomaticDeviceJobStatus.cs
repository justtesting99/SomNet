namespace SomNet.Device.LocalClient;

public enum AutomaticDeviceJobStatus
{
    Completed,
    FailedPrecondition,
    FailedStart,
    TimedOut,
    Cancelled,
    DeviceUnreachable,
}
