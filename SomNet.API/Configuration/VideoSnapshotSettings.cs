namespace SomNet.API.Configuration;

public sealed class VideoSnapshotSettings
{
    public const string SectionName = "Video:Snapshots";

    public bool Enabled { get; init; } = true;

    /// <summary>Relative to API content root unless absolute.</summary>
    public string StorageRoot { get; init; } = "../data/snapshots";

    public string Go2RtcBaseUrl { get; init; } = "http://localhost:1984";

    public int RearSettleDelayMs { get; init; } = 1000;

    public string FrontStreamName { get; init; } = "front";

    public string RearStreamName { get; init; } = "rear";
}
