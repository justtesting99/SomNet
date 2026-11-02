namespace SomNet.Shared.DTO.DeviceGateway;

public sealed class DeviceGatewayLocalUnlockResultDto
{
    public bool Unlocked { get; init; }

    public ulong ExpiresAtMs { get; init; }
}

public sealed class DeviceGatewayLocalSceneRequestDto
{
    public bool Active { get; init; }
}

public sealed class DeviceGatewayLocalSceneResultDto
{
    public bool SceneActive { get; init; }

    public bool Armed { get; init; }
}
