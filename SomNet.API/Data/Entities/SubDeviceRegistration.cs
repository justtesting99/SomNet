namespace SomNet.API.Data.Entities;

public sealed class SubDeviceRegistration
{
    public required string DomTarget { get; set; }

    public required string SubName { get; set; }

    public required string DeviceId { get; set; }

    public required string AccessToken { get; set; }

    public required string TokenJti { get; set; }

    public DateTimeOffset PairedAt { get; set; }

    public DateTimeOffset TokenExpiresAt { get; set; }

    public DateTimeOffset? LastConnectedAt { get; set; }

    public bool IsRevoked { get; set; }
}
