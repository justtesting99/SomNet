using SomNet.Device.LocalClient;
using SomNet.Device.LocalGateway.Services;
using Xunit;

namespace SomNet.Device.LocalGateway.Tests;

public sealed class GatewayRunMetricsTests
{
    [Fact]
    public void Prometheus_text_includes_run_and_stop_counters()
    {
        var metrics = new GatewayRunMetrics();
        metrics.RecordRun(AutomaticDeviceJobStatus.Completed);
        metrics.RecordRun(AutomaticDeviceJobStatus.Completed);
        metrics.RecordRun(AutomaticDeviceJobStatus.DeviceUnreachable);
        metrics.RecordStopAccepted();
        metrics.RecordConcurrentRunRejected();

        var text = metrics.ToPrometheusText();
        Assert.Contains("somnet_gateway_runs_total{status=\"Completed\"} 2", text, StringComparison.Ordinal);
        Assert.Contains("somnet_gateway_runs_total{status=\"DeviceUnreachable\"} 1", text, StringComparison.Ordinal);
        Assert.Contains("somnet_gateway_stop_accepted_total 1", text, StringComparison.Ordinal);
        Assert.Contains("somnet_gateway_concurrent_run_rejected_total 1", text, StringComparison.Ordinal);
    }
}
