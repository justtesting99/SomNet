using System.Security.Cryptography;
using Microsoft.Extensions.Options;
using SomNet.API.Configuration;

namespace SomNet.API.Services;

/// <summary>
/// AES-256-GCM envelope for action snapshot files. Legacy plain JPEG files (magic FF D8 FF) remain readable.
/// </summary>
public sealed class SnapshotFileProtection : ISnapshotFileProtection
{
    private const int KeySizeBytes = 32;
    private const int NonceSizeBytes = 12;
    private const int TagSizeBytes = 16;
    private const byte FormatVersion = 1;
    private static ReadOnlySpan<byte> Magic => "SNAP"u8;

    private readonly byte[] _key;

    public SnapshotFileProtection(IOptions<VideoSnapshotSettings> settings)
    {
        var value = settings.Value;
        Enabled = value.EncryptAtRest;
        _key = Enabled ? ParseKey(value.EncryptionKeyBase64) : [];
    }

    public bool Enabled { get; }

    public byte[] Protect(byte[] plaintext)
    {
        ArgumentNullException.ThrowIfNull(plaintext);

        if (!Enabled)
        {
            return plaintext;
        }

        var nonce = RandomNumberGenerator.GetBytes(NonceSizeBytes);
        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[TagSizeBytes];

        using var aes = new AesGcm(_key, TagSizeBytes);
        aes.Encrypt(nonce, plaintext, ciphertext, tag);

        var output = new byte[Magic.Length + 1 + NonceSizeBytes + ciphertext.Length + TagSizeBytes];
        var offset = 0;
        Magic.CopyTo(output.AsSpan(offset));
        offset += Magic.Length;
        output[offset++] = FormatVersion;
        nonce.CopyTo(output.AsSpan(offset));
        offset += NonceSizeBytes;
        ciphertext.CopyTo(output.AsSpan(offset));
        offset += ciphertext.Length;
        tag.CopyTo(output.AsSpan(offset));

        return output;
    }

    public byte[] Unprotect(byte[] stored)
    {
        ArgumentNullException.ThrowIfNull(stored);

        if (IsPlainJpeg(stored))
        {
            return stored;
        }

        if (!IsEncryptedFormat(stored))
        {
            throw new InvalidOperationException("Snapshot file is not a recognized JPEG or encrypted SNAP payload.");
        }

        if (stored.Length < Magic.Length + 1 + NonceSizeBytes + TagSizeBytes)
        {
            throw new InvalidOperationException("Encrypted snapshot payload is truncated.");
        }

        var version = stored[Magic.Length];
        if (version != FormatVersion)
        {
            throw new InvalidOperationException($"Unsupported snapshot encryption version {version}.");
        }

        var offset = Magic.Length + 1;
        var nonce = stored.AsSpan(offset, NonceSizeBytes);
        offset += NonceSizeBytes;
        var ciphertextLength = stored.Length - offset - TagSizeBytes;
        if (ciphertextLength < 0)
        {
            throw new InvalidOperationException("Encrypted snapshot payload is malformed.");
        }

        var ciphertext = stored.AsSpan(offset, ciphertextLength);
        offset += ciphertextLength;
        var tag = stored.AsSpan(offset, TagSizeBytes);
        var plaintext = new byte[ciphertextLength];

        using var aes = new AesGcm(_key, TagSizeBytes);
        aes.Decrypt(nonce, ciphertext, tag, plaintext);

        return plaintext;
    }

    public bool IsEncryptedFormat(ReadOnlySpan<byte> data) =>
        data.Length >= Magic.Length + 1 + NonceSizeBytes + TagSizeBytes &&
        data.StartsWith(Magic);

    public bool IsPlainJpeg(ReadOnlySpan<byte> data) =>
        data.Length >= 3 &&
        data[0] == 0xFF &&
        data[1] == 0xD8 &&
        data[2] == 0xFF;

    internal static bool TryParseKey(string? encryptionKeyBase64, out byte[] key)
    {
        key = [];
        if (string.IsNullOrWhiteSpace(encryptionKeyBase64))
        {
            return false;
        }

        try
        {
            key = Convert.FromBase64String(encryptionKeyBase64.Trim());
        }
        catch (FormatException)
        {
            return false;
        }

        return key.Length == KeySizeBytes;
    }

    internal static byte[] ParseKey(string? encryptionKeyBase64)
    {
        if (string.IsNullOrWhiteSpace(encryptionKeyBase64))
        {
            throw new InvalidOperationException(
                "Video:Snapshots:EncryptionKeyBase64 is required when EncryptAtRest is true.");
        }

        byte[] key;
        try
        {
            key = Convert.FromBase64String(encryptionKeyBase64.Trim());
        }
        catch (FormatException ex)
        {
            throw new InvalidOperationException(
                "Video:Snapshots:EncryptionKeyBase64 must be valid Base64.",
                ex);
        }

        if (key.Length != KeySizeBytes)
        {
            throw new InvalidOperationException(
                $"Video:Snapshots:EncryptionKeyBase64 must decode to exactly {KeySizeBytes} bytes.");
        }

        return key;
    }
}
