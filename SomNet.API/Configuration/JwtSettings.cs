namespace SomNet.API.Configuration;

public sealed class JwtSettings
{
    public const string SectionName = "Jwt";

    public required string Key { get; init; }

    public required string Issuer { get; init; }

    public required string Audience { get; init; }

    public required string DeviceAudience { get; init; }

    public int ExpireMinutes { get; init; } = 480;

    public int DeviceExpireDays { get; init; } = 365;

    /// <summary>
    /// Optional dev/test override. When set, device tokens expire after this many minutes
    /// instead of <see cref="DeviceExpireDays"/>. Must be at least 1.
    /// </summary>
    public int? DeviceExpireMinutes { get; init; }
}
