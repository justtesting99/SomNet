using System.Collections.Concurrent;
using System.Net;
using SomNet.Shared.DTO.Devices;

namespace SomNet.API.Services;

public enum HardwareConnectionRole
{
    Paired,
    Unpaired,
    Operator,
}

public sealed record RemovedHardwareConnection(
    HardwareConnectionRole Role,
    string? DeviceId,
    string? DomTarget,
    string? SubTarget);

public interface IDeviceConnectionRegistry
{
    void RegisterUnpaired(string deviceId, string connectionId, string? remoteIp = null);

    void RegisterPaired(string deviceId, string domTarget, string subTarget, string connectionId, string? remoteIp = null);

    void RegisterOperator(string domTarget, string connectionId);

    RemovedHardwareConnection? Unregister(string connectionId);

    bool TryGetUnpairedConnectionId(string deviceId, out string connectionId);

    bool IsPairedDeviceConnected(string domTarget, string subTarget);

    bool IsAnyDeviceConnected();

    bool IsSignalRActive();

    string? GetConnectedDeviceId(string domTarget, string subTarget);

    Task<HardwareCommandAckDto?> WaitForAcknowledgementAsync(
        string correlationId,
        TimeSpan timeout,
        CancellationToken cancellationToken = default);

    void CompleteAcknowledgement(HardwareCommandAckDto acknowledgement);

    IReadOnlyList<UnpairedDeviceResponseDto> ListUnpairedDevices();

    IReadOnlyList<string> GetLastKnownDeviceIps();
}

public sealed class DeviceConnectionRegistry : IDeviceConnectionRegistry
{
    private readonly ConcurrentDictionary<string, UnpairedConnection> _unpairedConnections =
        new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, PairedConnection> _pairedConnections = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, byte> _operatorConnections = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, TaskCompletionSource<HardwareCommandAckDto>> _pendingAcks =
        new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, string> _lastKnownDeviceIps =
        new(StringComparer.OrdinalIgnoreCase);

    public void RegisterUnpaired(string deviceId, string connectionId, string? remoteIp = null)
    {
        var key = NormalizeDeviceId(deviceId);
        _unpairedConnections[key] = new UnpairedConnection(connectionId, DateTimeOffset.UtcNow);
        RememberDeviceIp(key, remoteIp);
    }

    public void RegisterPaired(string deviceId, string domTarget, string subTarget, string connectionId, string? remoteIp = null)
    {
        var normalizedDeviceId = NormalizeDeviceId(deviceId);
        var pairingKey = CreatePairingKey(domTarget, subTarget);
        _pairedConnections[pairingKey] = new PairedConnection(
            normalizedDeviceId,
            domTarget.Trim(),
            subTarget.Trim(),
            connectionId);
        RememberDeviceIp(normalizedDeviceId, remoteIp);
    }

    public void RegisterOperator(string domTarget, string connectionId)
    {
        _operatorConnections[connectionId] = 0;
    }

    public RemovedHardwareConnection? Unregister(string connectionId)
    {
        foreach (var entry in _pairedConnections.Where(entry => entry.Value.ConnectionId == connectionId).ToList())
        {
            if (_pairedConnections.TryRemove(entry.Key, out var paired))
            {
                return new RemovedHardwareConnection(
                    HardwareConnectionRole.Paired,
                    paired.DeviceId,
                    paired.DomTarget,
                    paired.SubTarget);
            }
        }

        foreach (var entry in _unpairedConnections.Where(entry => entry.Value.ConnectionId == connectionId).ToList())
        {
            if (_unpairedConnections.TryRemove(entry.Key, out _))
            {
                return new RemovedHardwareConnection(
                    HardwareConnectionRole.Unpaired,
                    entry.Key,
                    null,
                    null);
            }
        }

        if (_operatorConnections.TryRemove(connectionId, out _))
        {
            return new RemovedHardwareConnection(
                HardwareConnectionRole.Operator,
                null,
                null,
                null);
        }

        return null;
    }

    public bool TryGetUnpairedConnectionId(string deviceId, out string connectionId)
    {
        if (_unpairedConnections.TryGetValue(NormalizeDeviceId(deviceId), out var connection))
        {
            connectionId = connection.ConnectionId;
            return true;
        }

        connectionId = string.Empty;
        return false;
    }

    public bool IsPairedDeviceConnected(string domTarget, string subTarget)
    {
        return _pairedConnections.ContainsKey(CreatePairingKey(domTarget, subTarget));
    }

    public bool IsAnyDeviceConnected() => !_pairedConnections.IsEmpty;

    public bool IsSignalRActive() => !_pairedConnections.IsEmpty || !_unpairedConnections.IsEmpty || !_operatorConnections.IsEmpty;

    public string? GetConnectedDeviceId(string domTarget, string subTarget)
    {
        return _pairedConnections.TryGetValue(CreatePairingKey(domTarget, subTarget), out var connection)
            ? connection.DeviceId
            : null;
    }

    public async Task<HardwareCommandAckDto?> WaitForAcknowledgementAsync(
        string correlationId,
        TimeSpan timeout,
        CancellationToken cancellationToken = default)
    {
        var completion = new TaskCompletionSource<HardwareCommandAckDto>(TaskCreationOptions.RunContinuationsAsynchronously);
        if (!_pendingAcks.TryAdd(correlationId, completion))
        {
            return null;
        }

        try
        {
            using var timeoutRegistration = cancellationToken.Register(() => completion.TrySetCanceled(cancellationToken));
            using var delayCancellation = new CancellationTokenSource(timeout);
            var completed = await Task.WhenAny(completion.Task, Task.Delay(timeout, delayCancellation.Token));

            if (completed != completion.Task)
            {
                return null;
            }

            return await completion.Task;
        }
        catch (OperationCanceledException)
        {
            return null;
        }
        finally
        {
            _pendingAcks.TryRemove(correlationId, out _);
        }
    }

    public void CompleteAcknowledgement(HardwareCommandAckDto acknowledgement)
    {
        if (_pendingAcks.TryGetValue(acknowledgement.CorrelationId, out var completion))
        {
            completion.TrySetResult(acknowledgement);
        }
    }

    public IReadOnlyList<UnpairedDeviceResponseDto> ListUnpairedDevices()
    {
        return _unpairedConnections
            .Select(entry => new UnpairedDeviceResponseDto
            {
                DeviceId = entry.Key,
                ConnectedAt = entry.Value.ConnectedAt,
            })
            .OrderBy(device => device.DeviceId, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public IReadOnlyList<string> GetLastKnownDeviceIps() =>
        _lastKnownDeviceIps.Values
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(ip => ip, StringComparer.OrdinalIgnoreCase)
            .ToList();

    private void RememberDeviceIp(string deviceId, string? remoteIp)
    {
        if (string.IsNullOrWhiteSpace(remoteIp))
        {
            return;
        }

        var normalizedIp = NormalizeRemoteIp(remoteIp);
        if (normalizedIp is null)
        {
            return;
        }

        _lastKnownDeviceIps[deviceId] = normalizedIp;
    }

    private static string? NormalizeRemoteIp(string remoteIp)
    {
        var trimmed = remoteIp.Trim();
        if (trimmed.StartsWith("::ffff:", StringComparison.OrdinalIgnoreCase))
        {
            trimmed = trimmed["::ffff:".Length..];
        }

        return IPAddress.TryParse(trimmed, out var address)
            ? address.MapToIPv4().ToString()
            : null;
    }

    private static string CreatePairingKey(string domTarget, string subTarget) =>
        $"{domTarget.Trim()}::{subTarget.Trim()}";

    private static string NormalizeDeviceId(string deviceId) => deviceId.Trim();

    private sealed record PairedConnection(
        string DeviceId,
        string DomTarget,
        string SubTarget,
        string ConnectionId);

    private sealed record UnpairedConnection(string ConnectionId, DateTimeOffset ConnectedAt);
}
