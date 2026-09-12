using SomNet.Shared.Models;

namespace SomNet.API.Tests;

public class HardwareCommandKeysTests
{
    [Theory]
    [InlineData(HardwareCommandKeys.ManualStroke, true)]
    [InlineData(HardwareCommandKeys.ManualBurst, true)]
    [InlineData(HardwareCommandKeys.DeviceStroke, true)]
    [InlineData(HardwareCommandKeys.DeviceBurst, true)]
    [InlineData(HardwareCommandKeys.ManualAbort, false)]
    [InlineData(HardwareCommandKeys.AutomaticStart, false)]
    public void IsManualSnapshotCommand_matches_manual_stroke_and_burst_only(string commandKey, bool expected)
    {
        Assert.Equal(expected, HardwareCommandKeys.IsManualSnapshotCommand(commandKey));
    }
}
