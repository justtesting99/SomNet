using SomNet.Device.LocalClient;
using SomNet.Shared.DTO.Modes;

namespace SomNet.Device.LocalGateway.Services;

public sealed class AutomaticRunCoordinator
{
    private readonly SemaphoreSlim _runGate = new(1, 1);
    private readonly IAutomaticDeviceJobRunner _runner;
    private readonly ILogger<AutomaticRunCoordinator> _logger;

    public AutomaticRunCoordinator(
        IAutomaticDeviceJobRunner runner,
        ILogger<AutomaticRunCoordinator> logger)
    {
        _runner = runner;
        _logger = logger;
    }

    public async Task<AutomaticRunCoordinatorResult> RunAsync(
        AutomaticControlStateDto parameters,
        AutomaticDeviceJobRunOptions runOptions,
        string correlationId,
        CancellationToken cancellationToken)
    {
        if (!await _runGate.WaitAsync(0, cancellationToken))
        {
            _logger.LogWarning(
                "Automatic run rejected — another gateway run is in progress (correlationId={CorrelationId}).",
                correlationId);

            return AutomaticRunCoordinatorResult.Concurrent();
        }

        try
        {
            _logger.LogInformation(
                "Automatic run started (correlationId={CorrelationId}).",
                correlationId);

            var result = await _runner.RunAutomaticAsync(parameters, runOptions, cancellationToken);

            if (!string.IsNullOrWhiteSpace(result.DeviceCorrelationId))
            {
                _logger.LogInformation(
                    "Automatic run finished status={Status} deviceCorrelationId={DeviceCorrelationId} gatewayCorrelationId={GatewayCorrelationId}",
                    result.Status,
                    result.DeviceCorrelationId,
                    correlationId);
            }
            else
            {
                _logger.LogInformation(
                    "Automatic run finished status={Status} gatewayCorrelationId={GatewayCorrelationId}",
                    result.Status,
                    correlationId);
            }

            return AutomaticRunCoordinatorResult.FromJob(result);
        }
        finally
        {
            _runGate.Release();
        }
    }
}

public sealed class AutomaticRunCoordinatorResult
{
    public bool IsConcurrent { get; init; }

    public AutomaticDeviceJobResult? Job { get; init; }

    public static AutomaticRunCoordinatorResult Concurrent() => new() { IsConcurrent = true };

    public static AutomaticRunCoordinatorResult FromJob(AutomaticDeviceJobResult job) =>
        new() { Job = job };
}
