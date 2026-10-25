namespace SomNet.Device.LocalClient;

/// <summary>
/// ESP SomEsp local API (<c>/api/local/*</c>). Implemented in Phase 1.
/// </summary>
public sealed class SomEspLocalClientOptions
{
    public const string SectionName = "Device";

    public string BaseUrl { get; init; } = "http://192.168.0.0";

    public string Pin { get; init; } = string.Empty;

    public int PollIntervalMs { get; init; } = 800;

    public TimeSpan HttpTimeout { get; init; } = TimeSpan.FromSeconds(30);
}
