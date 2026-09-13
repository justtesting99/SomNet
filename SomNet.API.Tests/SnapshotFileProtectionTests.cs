using SomNet.API.Configuration;
using SomNet.API.Services;
using Microsoft.Extensions.Options;

namespace SomNet.API.Tests;

public class SnapshotFileProtectionTests
{
    private static readonly string DevKeyBase64 =
        Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes("SomNet-Dev-Snapshot-Key-32bytes!"));

    private static SnapshotFileProtection CreateProtection(bool enabled = true) =>
        new(Options.Create(new VideoSnapshotSettings
        {
            EncryptAtRest = enabled,
            EncryptionKeyBase64 = DevKeyBase64,
        }));

    [Fact]
    public void Protect_round_trips_jpeg_bytes()
    {
        var protection = CreateProtection();
        var jpeg = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46 };

        var stored = protection.Protect(jpeg);
        var restored = protection.Unprotect(stored);

        Assert.True(protection.IsEncryptedFormat(stored));
        Assert.False(protection.IsPlainJpeg(stored));
        Assert.Equal(jpeg, restored);
    }

    [Fact]
    public void Unprotect_reads_legacy_plain_jpeg()
    {
        var protection = CreateProtection();
        var jpeg = new byte[] { 0xFF, 0xD8, 0xFF, 0xDB, 0x00, 0x43 };

        var restored = protection.Unprotect(jpeg);

        Assert.True(protection.IsPlainJpeg(jpeg));
        Assert.Equal(jpeg, restored);
    }

    [Fact]
    public void Protect_passthrough_when_disabled()
    {
        var protection = CreateProtection(enabled: false);
        var jpeg = new byte[] { 0xFF, 0xD8, 0xFF, 0x00 };

        var stored = protection.Protect(jpeg);

        Assert.Equal(jpeg, stored);
    }

    [Fact]
    public void TryParseKey_requires_32_bytes()
    {
        Assert.True(SnapshotFileProtection.TryParseKey(DevKeyBase64, out var key));
        Assert.Equal(32, key.Length);
        Assert.False(SnapshotFileProtection.TryParseKey(Convert.ToBase64String(new byte[16]), out _));
    }
}
