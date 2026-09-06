namespace SomNet.API.Configuration;

public sealed class HardwareReachabilityOptions
{
    public const string SectionName = "Hardware:ReachabilityPing";

    /// <summary>
    /// When true, the API host pings known device IPs while no hardware hub client is connected.
    /// Helps ESP32 learn the API PC MAC on LANs with asymmetric Wi-Fi routing (dev only).
    /// </summary>
    public bool Enabled { get; set; }

    public int IntervalSeconds { get; set; } = 15;

    public string[] DeviceIps { get; set; } = [];
}
