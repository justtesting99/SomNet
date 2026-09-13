namespace SomNet.API.Services;

public interface ISnapshotFileProtection
{
    bool Enabled { get; }

    byte[] Protect(byte[] plaintext);

    byte[] Unprotect(byte[] stored);

    bool IsEncryptedFormat(ReadOnlySpan<byte> data);

    bool IsPlainJpeg(ReadOnlySpan<byte> data);
}
