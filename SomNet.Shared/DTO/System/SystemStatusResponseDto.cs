using SomNet.Shared.Enums;

namespace SomNet.Shared.DTO.System;

public sealed class SystemStatusResponseDto
{
    public ConnectionState Api { get; init; } = ConnectionState.Online;

    public ConnectionState Device { get; init; } = ConnectionState.Offline;

    public ConnectionState SignalR { get; init; } = ConnectionState.Offline;

    public string? Message { get; init; }

    public string? DeviceName { get; init; }
}
