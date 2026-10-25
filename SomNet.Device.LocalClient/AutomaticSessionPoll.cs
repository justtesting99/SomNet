using SomNet.Device.LocalClient.Models;

namespace SomNet.Device.LocalClient;

internal static class AutomaticSessionPoll
{
    public static bool IsEngineIdle(LocalOperateStatus status) =>
        !status.AutomaticActive && !status.Busy;

    public static bool LooksLikeFailedStart(LocalOperateStatus status) =>
        IsEngineIdle(status) &&
        status.CommandComplete &&
        !status.CommandSuccess;
}
