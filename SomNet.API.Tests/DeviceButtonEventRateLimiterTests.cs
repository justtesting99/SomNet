using SomNet.API.Services;

namespace SomNet.API.Tests;

public class DeviceButtonEventRateLimiterTests
{
    [Fact]
    public void TryAcquire_allows_up_to_five_events_within_window()
    {
        var limiter = new DeviceButtonEventRateLimiter();
        var now = DateTimeOffset.UtcNow;

        for (var i = 0; i < 5; i++)
        {
            Assert.True(limiter.TryAcquire("esp32-test", now.AddMilliseconds(i * 100)));
        }

        Assert.False(limiter.TryAcquire("esp32-test", now.AddMilliseconds(600)));
    }

    [Fact]
    public void TryAcquire_resets_after_window_elapses()
    {
        var limiter = new DeviceButtonEventRateLimiter();
        var now = DateTimeOffset.UtcNow;

        for (var i = 0; i < 5; i++)
        {
            Assert.True(limiter.TryAcquire("esp32-test", now));
        }

        Assert.False(limiter.TryAcquire("esp32-test", now.AddSeconds(1)));

        Assert.True(limiter.TryAcquire("esp32-test", now.AddSeconds(11)));
    }
}
