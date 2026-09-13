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

    /// <summary>Max width passed to go2rtc <c>/api/frame.jpeg?width=</c>. 0 = stream native resolution.</summary>
    public int FrameCaptureMaxWidth { get; init; } = 1920;

    /// <summary>When true, snapshot JPEGs are AES-256-GCM encrypted on disk (SNAP envelope). Legacy plain JPEG files still serve.</summary>
    public bool EncryptAtRest { get; init; } = true;

    /// <summary>Base64-encoded 32-byte AES-256 key. Required when <see cref="EncryptAtRest"/> is true.</summary>
    public string? EncryptionKeyBase64 { get; init; }
}
