using System.Collections.Concurrent;

namespace SomNet.API.Services;

public sealed class DeviceButtonEventRateLimiter
{
    private const int MaxEvents = 5;
    private static readonly TimeSpan Window = TimeSpan.FromSeconds(10);

    private readonly ConcurrentDictionary<string, Queue<DateTimeOffset>> _eventsByDevice = new(StringComparer.OrdinalIgnoreCase);

    public bool TryAcquire(string deviceId, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(deviceId))
        {
            return false;
        }

        var key = deviceId.Trim();
        var queue = _eventsByDevice.GetOrAdd(key, _ => new Queue<DateTimeOffset>());

        lock (queue)
        {
            while (queue.Count > 0 && now - queue.Peek() > Window)
            {
                queue.Dequeue();
            }

            if (queue.Count >= MaxEvents)
            {
                return false;
            }

            queue.Enqueue(now);
            return true;
        }
    }
}
