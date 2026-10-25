using Microsoft.Extensions.Options;
using SomNet.Device.LocalClient.Models;
using SomNet.Shared.DTO.Modes;
using SomNet.Shared.History;
using SomNet.Shared.Models;

namespace SomNet.Device.LocalClient;

public sealed class AutomaticDeviceJobRunner
{
    private readonly ISomEspLocalSessionClient _client;
    private readonly SomEspLocalClientOptions _options;

    public AutomaticDeviceJobRunner(
        ISomEspLocalSessionClient client,
        IOptions<SomEspLocalClientOptions> options)
    {
        _client = client;
        _options = options.Value;
    }

    public async Task<AutomaticDeviceJobResult> RunAutomaticAsync(
        AutomaticControlStateDto parameters,
        AutomaticDeviceJobRunOptions? runOptions = null,
        CancellationToken cancellationToken = default)
    {
        runOptions ??= new AutomaticDeviceJobRunOptions();
        var startedAtUtc = DateTimeOffset.UtcNow;

        try
        {
            await _client.UnlockAsync(cancellationToken: cancellationToken);

            var preflight = await _client.GetLocalStatusAsync(cancellationToken);
            if (preflight.Busy || preflight.AutomaticActive)
            {
                return Finish(
                    AutomaticDeviceJobStatus.FailedPrecondition,
                    "Device busy or automatic session already active; job skipped.",
                    startedAtUtc,
                    DateTimeOffset.UtcNow,
                    null,
                    null,
                    null);
            }

            if (runOptions.ArmBeforeStart)
            {
                await _client.ArmAsync(cancellationToken);
            }

            var payloadJson = AutomaticStartPayloadBuilder.BuildJson(parameters);
            var accepted = await _client.SendCommandAsync(
                HardwareCommandKeys.AutomaticStart,
                payloadJson,
                cancellationToken);

            var deadline = DateTimeOffset.UtcNow + runOptions.WaitTimeout;
            var pollDelay = TimeSpan.FromMilliseconds(Math.Max(100, _options.PollIntervalMs));

            while (DateTimeOffset.UtcNow < deadline)
            {
                cancellationToken.ThrowIfCancellationRequested();

                await Task.Delay(pollDelay, cancellationToken);
                var status = await _client.GetLocalStatusAsync(cancellationToken);

                if (AutomaticSessionPoll.LooksLikeFailedStart(status))
                {
                    return Finish(
                        AutomaticDeviceJobStatus.FailedStart,
                        FormatCommandMessage("Automatic start rejected", status),
                        startedAtUtc,
                        DateTimeOffset.UtcNow,
                        accepted.CorrelationId,
                        status.ResultJson,
                        AutomaticSessionResultParser.TryParse(status.ResultJson));
                }

                if (!AutomaticSessionPoll.IsEngineIdle(status))
                {
                    continue;
                }

                var result = AutomaticSessionResultParser.TryParse(status.ResultJson);
                var summary = AutomaticSessionSummaryBuilder.BuildFromResultJson(status.ResultJson);
                await ApplyAfterRunAsync(runOptions, cancellationToken);

                return Finish(
                    AutomaticDeviceJobStatus.Completed,
                    summary,
                    startedAtUtc,
                    DateTimeOffset.UtcNow,
                    status.LastCorrelationId ?? accepted.CorrelationId,
                    status.ResultJson,
                    result,
                    summary);
            }

            await TryStopAsync(cancellationToken);
            return Finish(
                AutomaticDeviceJobStatus.TimedOut,
                $"Poll timeout after {runOptions.WaitTimeout.TotalMinutes:F0} min; automatic may still be running.",
                startedAtUtc,
                DateTimeOffset.UtcNow,
                accepted.CorrelationId,
                null,
                null);
        }
        catch (OperationCanceledException)
        {
            await TryStopAsync(CancellationToken.None);
            return Finish(
                AutomaticDeviceJobStatus.Cancelled,
                "Run cancelled.",
                startedAtUtc,
                DateTimeOffset.UtcNow,
                null,
                null,
                null);
        }
        catch (SomEspLocalApiException ex)
        {
            return Finish(
                AutomaticDeviceJobStatus.DeviceUnreachable,
                ex.Message,
                startedAtUtc,
                DateTimeOffset.UtcNow,
                null,
                null,
                null);
        }
        catch (HttpRequestException ex)
        {
            return Finish(
                AutomaticDeviceJobStatus.DeviceUnreachable,
                $"Device unreachable: {ex.Message}",
                startedAtUtc,
                DateTimeOffset.UtcNow,
                null,
                null,
                null);
        }
    }

    private async Task ApplyAfterRunAsync(
        AutomaticDeviceJobRunOptions runOptions,
        CancellationToken cancellationToken)
    {
        if (runOptions.DisarmAfterRun)
        {
            await _client.DisarmAsync(cancellationToken);
        }

        if (runOptions.LockAfterRun)
        {
            await _client.LockAsync(cancellationToken);
        }
    }

    private async Task TryStopAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _client.SendCommandAsync(
                HardwareCommandKeys.AutomaticStop,
                "{}",
                cancellationToken);
        }
        catch (SomEspLocalApiException)
        {
            // Best-effort on cancel/timeout.
        }
        catch (HttpRequestException)
        {
            // Best-effort on cancel/timeout.
        }
    }

    private static AutomaticDeviceJobResult Finish(
        AutomaticDeviceJobStatus status,
        string message,
        DateTimeOffset startedAtUtc,
        DateTimeOffset endedAtUtc,
        string? correlationId,
        string? rawResultJson,
        AutomaticSessionResultDto? result,
        string? summary = null)
    {
        return new AutomaticDeviceJobResult
        {
            Status = status,
            Message = message,
            DeviceCorrelationId = correlationId,
            RawResultJson = rawResultJson,
            Result = result,
            Summary = summary,
            StartedAtUtc = startedAtUtc,
            EndedAtUtc = endedAtUtc,
        };
    }

    private static string FormatCommandMessage(string prefix, LocalOperateStatus status)
    {
        if (!string.IsNullOrWhiteSpace(status.CommandMessage))
        {
            return $"{prefix}: {status.CommandMessage}";
        }

        return prefix;
    }

}
