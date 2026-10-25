namespace SomNet.Device.LocalClient;

/// <summary>Gateway/device pool configuration (<c>Device</c> section).</summary>
public sealed class ConfiguredDeviceOptions
{
    public const string SectionName = "Device";

    /// <summary>Legacy single-device URL (used when <see cref="Devices"/> is empty).</summary>
    public string BaseUrl { get; init; } = string.Empty;

    /// <summary>Legacy single-device PIN.</summary>
    public string Pin { get; init; } = string.Empty;

    /// <summary>Legacy explicit id; if empty, registry uses <see cref="ConfiguredDeviceRegistry.LegacyDefaultDeviceId"/>.</summary>
    public string? DeviceId { get; init; }

    public int PollIntervalMs { get; init; } = 800;

    public int HttpTimeoutSeconds { get; init; } = 30;

    public List<ConfiguredDeviceEntryOptions> Devices { get; init; } = new();

    public TimeSpan HttpTimeout => TimeSpan.FromSeconds(HttpTimeoutSeconds);
}

public sealed class ConfiguredDeviceEntryOptions
{
    public required string DeviceId { get; init; }

    public required string BaseUrl { get; init; }

    public string Pin { get; init; } = string.Empty;
}

public sealed record ResolvedDeviceEntry(
    string DeviceId,
    string BaseUrl,
    string Pin,
    int PollIntervalMs,
    TimeSpan HttpTimeout);
