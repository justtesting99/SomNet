using System.Collections.Concurrent;
using SomNet.Device.LocalClient;
using SomNet.Shared.DTO.Modes;
using SomNet.Shared.Models;

namespace SomNet.Device.LocalGateway.Services;

public sealed class AutomaticRunCoordinator
{
    private readonly IAutomaticDeviceJobRunnerFactory _runnerFactory;
    private readonly ISomEspLocalSessionClientFactory _sessionClientFactory;
    private readonly ILogger<AutomaticRunCoordinator> _logger;
    private readonly GatewayRunMetrics _metrics;
    private readonly ConcurrentDictionary<string, DeviceRunSlot> _slots =
        new(StringComparer.OrdinalIgnoreCase);

    public AutomaticRunCoordinator(
        IAutomaticDeviceJobRunnerFactory runnerFactory,
        ISomEspLocalSessionClientFactory sessionClientFactory,
        GatewayRunMetrics metrics,
        ILogger<AutomaticRunCoordinator> logger)
    {
        _runnerFactory = runnerFactory;
        _sessionClientFactory = sessionClientFactory;
        _metrics = metrics;
        _logger = logger;
    }

    public async Task<AutomaticRunCoordinatorResult> RunAsync(
        string deviceId,
        AutomaticControlStateDto parameters,
        AutomaticDeviceJobRunOptions runOptions,
        string correlationId,
        CancellationToken cancellationToken)
    {
        var slot = GetSlot(deviceId);
        if (!await slot.RunGate.WaitAsync(0, cancellationToken))
        {
            _logger.LogWarning(
                "Automatic run rejected for deviceId={DeviceId} — run already in progress (correlationId={CorrelationId}).",
                deviceId,
                correlationId);

            _metrics.RecordConcurrentRunRejected();
            return AutomaticRunCoordinatorResult.Concurrent();
        }

        slot.SetActive(true);
        try
        {
            _logger.LogInformation(
                "Automatic run started deviceId={DeviceId} (correlationId={CorrelationId}).",
                deviceId,
                correlationId);

            var runner = _runnerFactory.CreateRunner(deviceId);
            var result = await runner.RunAutomaticAsync(parameters, runOptions, cancellationToken);

            if (!string.IsNullOrWhiteSpace(result.DeviceCorrelationId))
            {
                _logger.LogInformation(
                    "Automatic run finished deviceId={DeviceId} status={Status} deviceCorrelationId={DeviceCorrelationId} gatewayCorrelationId={GatewayCorrelationId}",
                    deviceId,
                    result.Status,
                    result.DeviceCorrelationId,
                    correlationId);
            }
            else
            {
                _logger.LogInformation(
                    "Automatic run finished deviceId={DeviceId} status={Status} gatewayCorrelationId={GatewayCorrelationId}",
                    deviceId,
                    result.Status,
                    correlationId);
            }

            _metrics.RecordRun(result.Status);
            return AutomaticRunCoordinatorResult.FromJob(result);
        }
        finally
        {
            slot.SetActive(false);
            slot.RunGate.Release();
        }
    }

    public async Task<AutomaticRunCoordinatorStopResult> StopActiveRunAsync(
        string deviceId,
        bool abort,
        string correlationId,
        CancellationToken cancellationToken)
    {
        var slot = GetSlot(deviceId);
        if (!slot.IsActive)
        {
            _metrics.RecordStopNoActiveRun();
            return AutomaticRunCoordinatorStopResult.NoActiveRun();
        }

        var commandKey = abort ? "abort" : HardwareCommandKeys.AutomaticStop;
        _logger.LogInformation(
            "Automatic stop requested deviceId={DeviceId} commandKey={CommandKey} gatewayCorrelationId={GatewayCorrelationId}",
            deviceId,
            commandKey,
            correlationId);

        try
        {
            var client = _sessionClientFactory.GetClient(deviceId);
            await client.SendCommandAsync(commandKey, "{}", cancellationToken);
        }
        catch (SomEspLocalApiException ex)
        {
            _logger.LogWarning(ex, "Automatic stop failed (device API) deviceId={DeviceId}.", deviceId);
            _metrics.RecordStopDeviceError();
            return AutomaticRunCoordinatorStopResult.DeviceError(ex.Message);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Automatic stop failed (device unreachable) deviceId={DeviceId}.", deviceId);
            _metrics.RecordStopDeviceError();
            return AutomaticRunCoordinatorStopResult.DeviceError(ex.Message);
        }

        _metrics.RecordStopAccepted();
        return AutomaticRunCoordinatorStopResult.Accepted(commandKey);
    }

    private DeviceRunSlot GetSlot(string deviceId) =>
        _slots.GetOrAdd(deviceId, static _ => new DeviceRunSlot());

    private sealed class DeviceRunSlot
    {
        public SemaphoreSlim RunGate { get; } = new(1, 1);

        private readonly object _lock = new();
        private bool _active;

        public bool IsActive
        {
            get
            {
                lock (_lock)
                {
                    return _active;
                }
            }
        }

        public void SetActive(bool active)
        {
            lock (_lock)
            {
                _active = active;
            }
        }
    }
}

public sealed class AutomaticRunCoordinatorStopResult
{
    public bool HasActiveRun { get; init; }

    public bool IsStopAccepted { get; init; }

    public string? CommandKey { get; init; }

    public string? ErrorMessage { get; init; }

    public static AutomaticRunCoordinatorStopResult NoActiveRun() =>
        new() { HasActiveRun = false };

    public static AutomaticRunCoordinatorStopResult Accepted(string commandKey) =>
        new() { HasActiveRun = true, IsStopAccepted = true, CommandKey = commandKey };

    public static AutomaticRunCoordinatorStopResult DeviceError(string message) =>
        new() { HasActiveRun = true, IsStopAccepted = false, ErrorMessage = message };
}

public sealed class AutomaticRunCoordinatorResult
{
    public bool IsConcurrent { get; init; }

    public AutomaticDeviceJobResult? Job { get; init; }

    public static AutomaticRunCoordinatorResult Concurrent() => new() { IsConcurrent = true };

    public static AutomaticRunCoordinatorResult FromJob(AutomaticDeviceJobResult job) =>
        new() { Job = job };
}
