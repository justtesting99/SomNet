using System.Text.Json;
using SomNet.Device.LocalClient.Models;
using SomNet.Shared.History;
using Xunit;

namespace SomNet.Device.LocalClient.Tests;

public sealed class EspJsonFixtureTests
{
    [Fact]
    public void Running_status_fixture_is_not_idle()
    {
        var status = LoadStatus("esp-local-status-running.json");
        Assert.True(status.AutomaticActive);
        Assert.True(status.Busy);
        Assert.False(AutomaticSessionPoll.IsEngineIdle(status));
    }

    [Fact]
    public void Complete_status_fixture_is_idle_with_result_json()
    {
        var status = LoadStatus("esp-local-status-complete.json");
        Assert.True(AutomaticSessionPoll.IsEngineIdle(status));
        Assert.NotNull(status.ResultJson);
        Assert.Contains("automatic-stop", status.ResultJson, StringComparison.Ordinal);
    }

    [Fact]
    public void Automatic_stop_result_fixture_builds_summary()
    {
        var json = LoadFixtureText("esp-automatic-stop-result.json");
        var summary = AutomaticSessionSummaryBuilder.BuildFromResultJson(json, null);
        Assert.Contains("Periodic", summary, StringComparison.Ordinal);
        Assert.Contains("5", summary, StringComparison.Ordinal);
    }

    private static LocalOperateStatus LoadStatus(string fileName)
    {
        var json = LoadFixtureText(fileName);
        return JsonSerializer.Deserialize<LocalOperateStatus>(json, LocalClientJson.Options)
            ?? throw new InvalidOperationException($"Failed to deserialize {fileName}");
    }

    private static string LoadFixtureText(string fileName)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Fixtures", fileName);
        return File.ReadAllText(path);
    }
}
