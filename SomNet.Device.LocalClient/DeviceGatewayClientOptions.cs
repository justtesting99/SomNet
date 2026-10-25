namespace SomNet.Device.LocalClient;

public sealed class DeviceGatewayClientOptions
{
    public const string SectionName = "DeviceGateway";

    public string BaseUrl { get; init; } = "http://localhost:5290";

    public string ApiKey { get; init; } = string.Empty;

    /// <summary>Must cover longest <c>waitTimeoutSeconds</c> plus margin (gateway blocks until run ends).</summary>
    public TimeSpan HttpTimeout { get; init; } = TimeSpan.FromHours(2) + TimeSpan.FromMinutes(5);
}
