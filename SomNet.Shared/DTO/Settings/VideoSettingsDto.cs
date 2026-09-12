namespace SomNet.Shared.DTO.Settings;

public sealed class VideoSettingsDto
{
    /// <summary>
    /// go2rtc embed base (e.g. /go2rtc/stream.html or tunnel HTTPS URL). Empty = API config default.
    /// </summary>
    public string TunnelBaseUrl { get; init; } = string.Empty;
}
