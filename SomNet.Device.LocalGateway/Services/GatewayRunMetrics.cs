using System.Collections.Concurrent;
using System.Globalization;
using System.Text;
using SomNet.Device.LocalClient;

namespace SomNet.Device.LocalGateway.Services;

public sealed class GatewayRunMetrics
{
    private readonly ConcurrentDictionary<string, long> _runsByStatus = new(StringComparer.Ordinal);
    private long _stopAccepted;
    private long _stopNoActiveRun;
    private long _stopDeviceError;
    private long _concurrentRejected;

    public void RecordRun(AutomaticDeviceJobStatus status)
    {
        var key = status.ToString();
        _runsByStatus.AddOrUpdate(key, 1, static (_, count) => count + 1);
    }

    public void RecordConcurrentRunRejected() =>
        Interlocked.Increment(ref _concurrentRejected);

    public void RecordStopAccepted() =>
        Interlocked.Increment(ref _stopAccepted);

    public void RecordStopNoActiveRun() =>
        Interlocked.Increment(ref _stopNoActiveRun);

    public void RecordStopDeviceError() =>
        Interlocked.Increment(ref _stopDeviceError);

    public string ToPrometheusText()
    {
        var sb = new StringBuilder();
        sb.AppendLine("# HELP somnet_gateway_runs_total Automatic runs finished by terminal status.");
        sb.AppendLine("# TYPE somnet_gateway_runs_total counter");
        foreach (var pair in _runsByStatus.OrderBy(p => p.Key, StringComparer.Ordinal))
        {
            sb.Append("somnet_gateway_runs_total{status=\"")
                .Append(pair.Key)
                .Append("\"} ")
                .Append(pair.Value.ToString(CultureInfo.InvariantCulture))
                .AppendLine();
        }

        AppendCounter(sb, "somnet_gateway_stop_accepted_total", _stopAccepted);
        AppendCounter(sb, "somnet_gateway_stop_no_active_run_total", _stopNoActiveRun);
        AppendCounter(sb, "somnet_gateway_stop_device_error_total", _stopDeviceError);
        AppendCounter(sb, "somnet_gateway_concurrent_run_rejected_total", _concurrentRejected);
        return sb.ToString();
    }

    private static void AppendCounter(StringBuilder sb, string name, long value)
    {
        sb.AppendLine($"# TYPE {name} counter");
        sb.Append(name)
            .Append(' ')
            .Append(value.ToString(CultureInfo.InvariantCulture))
            .AppendLine();
    }
}
