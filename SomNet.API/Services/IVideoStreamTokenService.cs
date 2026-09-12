using SomNet.Shared.DTO.Video;

namespace SomNet.API.Services;

public interface IVideoStreamTokenService
{
    SessionVideoTokensResponseDto MintSessionTokens(
        string sessionId,
        string domTarget,
        string subTarget,
        string frontEmbedPath,
        string rearEmbedPath);

    void RevokeSession(string sessionId);

    bool TryValidateToken(string token, out VideoStreamTokenValidationResult? result);
}

public sealed class VideoStreamTokenValidationResult
{
    public required string SessionId { get; init; }

    public required string DomTarget { get; init; }

    public required string SubTarget { get; init; }

    public required string Feed { get; init; }

    public required string JwtId { get; init; }
}
