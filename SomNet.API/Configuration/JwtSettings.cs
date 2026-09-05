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
}
