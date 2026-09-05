using System.Collections.Concurrent;
using SomNet.Shared.DTO.Devices;

namespace SomNet.API.Services;

public interface IDeviceConnectionRegistry
{
    void RegisterUnpaired(string deviceId, string connectionId);

    void RegisterPaired(string deviceId, string domTarget, string subTarget, string connectionId);

    void RegisterOperator(string domTarget, string connectionId);

    void Unregister(string connectionId);

    bool TryGetUnpairedConnectionId(string deviceId, out string connectionId);

    bool IsPairedDeviceConnected(string domTarget, string subTarget);

    bool IsAnyDeviceConnected();

    bool IsSignalRActive();

    string? GetConnectedDeviceId(string domTarget, string subTarget);

    Task<bool> WaitForAcknowledgementAsync(
        string correlationId,
        TimeSpan timeout,
        CancellationToken cancellationToken = default);

    void CompleteAcknowledgement(HardwareCommandAckDto acknowledgement);
}

public sealed class DeviceConnectionRegistry : IDeviceConnectionRegistry
{
    private readonly ConcurrentDictionary<string, string> _unpairedConnections = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, PairedConnection> _pairedConnections = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, byte> _operatorConnections = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, TaskCompletionSource<HardwareCommandAckDto>> _pendingAcks =
        new(StringComparer.OrdinalIgnoreCase);

    public void RegisterUnpaired(string deviceId, string connectionId)
    {
        var key = NormalizeDeviceId(deviceId);
        _unpairedConnections[key] = connectionId;
    }

    public void RegisterPaired(string deviceId, string domTarget, string subTarget, string connectionId)
    {
        var pairingKey = CreatePairingKey(domTarget, subTarget);
        _pairedConnections[pairingKey] = new PairedConnection(
            NormalizeDeviceId(deviceId),
            domTarget.Trim(),
            subTarget.Trim(),
            connectionId);
    }

    public void RegisterOperator(string domTarget, string connectionId)
    {
        _operatorConnections[connectionId] = 0;
    }

    public void Unregister(string connectionId)
    {
        foreach (var entry in _unpairedConnections.Where(entry => entry.Value == connectionId).ToList())
        {
            _unpairedConnections.TryRemove(entry.Key, out _);
        }

        foreach (var entry in _pairedConnections.Where(entry => entry.Value.ConnectionId == connectionId).ToList())
        {
            _pairedConnections.TryRemove(entry.Key, out _);
        }

        _operatorConnections.TryRemove(connectionId, out _);
    }

    public bool TryGetUnpairedConnectionId(string deviceId, out string connectionId)
    {
        return _unpairedConnections.TryGetValue(NormalizeDeviceId(deviceId), out connectionId!);
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

    public async Task<bool> WaitForAcknowledgementAsync(
        string correlationId,
        TimeSpan timeout,
        CancellationToken cancellationToken = default)
    {
        var completion = new TaskCompletionSource<HardwareCommandAckDto>(TaskCreationOptions.RunContinuationsAsynchronously);
        if (!_pendingAcks.TryAdd(correlationId, completion))
        {
            return false;
        }

        try
        {
            using var timeoutRegistration = cancellationToken.Register(() => completion.TrySetCanceled(cancellationToken));
            using var delayCancellation = new CancellationTokenSource(timeout);
            var completed = await Task.WhenAny(completion.Task, Task.Delay(timeout, delayCancellation.Token));

            if (completed != completion.Task)
            {
                completion.TrySetResult(new HardwareCommandAckDto
                {
                    CorrelationId = correlationId,
                    Success = false,
                    Message = "Device acknowledgement timed out.",
                });
            }

            var result = await completion.Task;
            return result.Success;
        }
        catch (OperationCanceledException)
        {
            return false;
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

    private static string CreatePairingKey(string domTarget, string subTarget) =>
        $"{domTarget.Trim()}::{subTarget.Trim()}";

    private static string NormalizeDeviceId(string deviceId) => deviceId.Trim();

    private sealed record PairedConnection(
        string DeviceId,
        string DomTarget,
        string SubTarget,
        string ConnectionId);
}
