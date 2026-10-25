using Microsoft.Extensions.Options;
using Xunit;
using SomNet.Device.LocalClient;
using SomNet.Device.LocalClient.Models;
using SomNet.Shared.DTO.Modes;
using SomNet.Shared.Enums;
namespace SomNet.Device.LocalClient.Tests;

public sealed class AutomaticDeviceJobRunnerTests
{
    [Fact]
    public async Task RunAutomatic_completes_when_engine_becomes_idle_with_result()
    {
        var fake = new FakeSessionClient();
        fake.EnqueueStatus(new LocalOperateStatus { Busy = true, AutomaticActive = true });
        fake.EnqueueStatus(new LocalOperateStatus
        {
            Busy = false,
            AutomaticActive = false,
            ResultJson = """{"commandKey":"automatic-stop","automaticMode":"periodic","strokesCompleted":5,"durationMs":120000,"endReason":"endSession"}""",
            LastCorrelationId = "local-abc",
        });

        var runner = CreateRunner(fake, pollIntervalMs: 10);
        var result = await runner.RunAutomaticAsync(
            MinimalParameters(),
            new AutomaticDeviceJobRunOptions { WaitTimeout = TimeSpan.FromSeconds(2) });

        Assert.Equal(AutomaticDeviceJobStatus.Completed, result.Status);
        Assert.Equal(5, result.Result?.StrokesCompleted);
        Assert.Equal(
            "Periodic — 5 main strokes over 2 min (end session rule)",
            result.Summary);
        Assert.Equal(result.Summary, result.Message);
        Assert.True(fake.Disarmed);
    }

    [Fact]
    public async Task RunAutomatic_failed_precondition_when_already_active()
    {
        var fake = new FakeSessionClient
        {
            PreflightStatus = new LocalOperateStatus { AutomaticActive = true },
        };

        var runner = CreateRunner(fake);
        var result = await runner.RunAutomaticAsync(MinimalParameters());

        Assert.Equal(AutomaticDeviceJobStatus.FailedPrecondition, result.Status);
        Assert.Empty(fake.Commands);
    }

    [Fact]
    public async Task RunAutomatic_failed_start_when_command_rejected()
    {
        var fake = new FakeSessionClient();
        fake.EnqueueStatus(new LocalOperateStatus
        {
            CommandComplete = true,
            CommandSuccess = false,
            CommandMessage = "session accessory off",
        });

        var runner = CreateRunner(fake, pollIntervalMs: 10);
        var result = await runner.RunAutomaticAsync(
            MinimalParameters(),
            new AutomaticDeviceJobRunOptions { WaitTimeout = TimeSpan.FromSeconds(1) });

        Assert.Equal(AutomaticDeviceJobStatus.FailedStart, result.Status);
        Assert.Contains("session accessory off", result.Message);
    }

    [Fact]
    public async Task RunAutomatic_times_out_when_still_active()
    {
        var fake = new FakeSessionClient();
        fake.EnqueueStatus(new LocalOperateStatus { Busy = true, AutomaticActive = true });
        fake.EnqueueStatus(new LocalOperateStatus { Busy = true, AutomaticActive = true });
        fake.EnqueueStatus(new LocalOperateStatus { Busy = true, AutomaticActive = true });

        var runner = CreateRunner(fake, pollIntervalMs: 20);
        var result = await runner.RunAutomaticAsync(
            MinimalParameters(),
            new AutomaticDeviceJobRunOptions { WaitTimeout = TimeSpan.FromMilliseconds(80) });

        Assert.Equal(AutomaticDeviceJobStatus.TimedOut, result.Status);
        Assert.Contains("automatic-stop", fake.Commands.LastOrDefault() ?? string.Empty);
    }

    private static AutomaticDeviceJobRunner CreateRunner(FakeSessionClient fake, int pollIntervalMs = 50) =>
        new(
            fake,
            Options.Create(new SomEspLocalClientOptions { PollIntervalMs = pollIntervalMs, Pin = "1234" }));

    private static AutomaticControlStateDto MinimalParameters() => new()
    {
        AutomaticMode = AutomaticRunMode.Periodic,
        MinimumStrokeMs = 25,
        MaximumStrokeMs = 400,
        EndSessionMode = EndSessionMode.Strokes,
        EndSessionValue = 3,
    };

    private sealed class FakeSessionClient : ISomEspLocalSessionClient
    {
        private readonly Queue<LocalOperateStatus> _pollStatuses = new();
        private int _statusCallCount;

        public LocalOperateStatus PreflightStatus { get; init; } = new();

        public List<string> Commands { get; } = new();

        public bool Disarmed { get; private set; }

        public void EnqueueStatus(LocalOperateStatus status) => _pollStatuses.Enqueue(status);

        public Task<LocalUnlockResponse> UnlockAsync(
            string? pin = null,
            string? newPin = null,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(new LocalUnlockResponse
            {
                Token = "t",
                Unlocked = true,
                ExpiresAtMs = 1,
            });

        public Task LockAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task ArmAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task DisarmAsync(CancellationToken cancellationToken = default)
        {
            Disarmed = true;
            return Task.CompletedTask;
        }

        public Task<LocalOperateStatus> GetLocalStatusAsync(CancellationToken cancellationToken = default)
        {
            _statusCallCount++;
            if (_statusCallCount == 1)
            {
                return Task.FromResult(PreflightStatus);
            }

            if (_pollStatuses.Count > 0)
            {
                return Task.FromResult(_pollStatuses.Dequeue());
            }

            return Task.FromResult(new LocalOperateStatus { Busy = true, AutomaticActive = true });
        }

        public Task<LocalCommandAcceptedResponse> SendCommandAsync(
            string commandKey,
            string payloadJson = "{}",
            CancellationToken cancellationToken = default)
        {
            Commands.Add(commandKey);
            return Task.FromResult(new LocalCommandAcceptedResponse
            {
                Accepted = true,
                CorrelationId = "local-start",
            });
        }
    }
}
