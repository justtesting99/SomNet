namespace SomNet.Edge.Agent.Configuration;

public sealed class EdgeAgentSettings
{
    public const string SectionName = "EdgeAgent";

    public string ApiKey { get; init; } = string.Empty;

    public string Go2RtcBaseUrl { get; init; } = "http://localhost:1984";
}
