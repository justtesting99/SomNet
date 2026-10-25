namespace SomNet.Device.LocalGateway.Configuration;

public sealed class GatewaySettings
{
    public const string SectionName = "Gateway";

    public string ApiKey { get; init; } = string.Empty;
}
