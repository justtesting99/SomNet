using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using SomNet.API.Configuration;
using SomNet.Shared.DTO.Video;

namespace SomNet.API.Services;

public sealed class VideoStreamTokenService : IVideoStreamTokenService
{
    internal static class ClaimNames
    {
        public const string SessionId = "sessionId";
        public const string Dom = "dom";
        public const string Sub = "sub";
        public const string Feed = "feed";
    }

    private readonly JwtSettings _jwtSettings;
    private readonly VideoStreamSettings _videoSettings;
    private readonly JwtSecurityTokenHandler _tokenHandler = new();
    private readonly ConcurrentDictionary<string, byte> _revokedJwtIds = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, byte>> _sessionJwtIds = new(StringComparer.Ordinal);

    public VideoStreamTokenService(
        IOptions<JwtSettings> jwtSettings,
        IOptions<VideoStreamSettings> videoSettings)
    {
        _jwtSettings = jwtSettings.Value;
        _videoSettings = videoSettings.Value;
    }

    public SessionVideoTokensResponseDto MintSessionTokens(
        string sessionId,
        string domTarget,
        string subTarget,
        string frontEmbedPath,
        string rearEmbedPath)
    {
        // Phase 3: keep prior tokens valid until session end (RevokeSession on /end).
        // Reminting during an active session must not break already-embedded iframe URLs.
        var front = MintFeedToken(sessionId, domTarget, subTarget, "front", frontEmbedPath);
        var rear = MintFeedToken(sessionId, domTarget, subTarget, "rear", rearEmbedPath);

        return new SessionVideoTokensResponseDto
        {
            Front = front,
            Rear = rear,
        };
    }

    public void RevokeSession(string sessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return;
        }

        if (!_sessionJwtIds.TryRemove(sessionId.Trim(), out var jwtIds))
        {
            return;
        }

        foreach (var jwtId in jwtIds.Keys)
        {
            _revokedJwtIds.TryAdd(jwtId, 0);
        }
    }

    public bool TryValidateToken(string token, out VideoStreamTokenValidationResult? result)
    {
        result = null;

        if (string.IsNullOrWhiteSpace(token))
        {
            return false;
        }

        try
        {
            var principal = _tokenHandler.ValidateToken(
                token,
                CreateValidationParameters(),
                out var validatedToken);

            if (validatedToken is not JwtSecurityToken jwtToken)
            {
                return false;
            }

            var jwtId = principal.FindFirstValue(JwtRegisteredClaimNames.Jti);
            if (string.IsNullOrWhiteSpace(jwtId) || _revokedJwtIds.ContainsKey(jwtId))
            {
                return false;
            }

            var sessionId = principal.FindFirstValue(ClaimNames.SessionId);
            var dom = principal.FindFirstValue(ClaimNames.Dom);
            var sub = principal.FindFirstValue(ClaimNames.Sub);
            var feed = principal.FindFirstValue(ClaimNames.Feed);

            if (string.IsNullOrWhiteSpace(sessionId) ||
                string.IsNullOrWhiteSpace(dom) ||
                string.IsNullOrWhiteSpace(sub) ||
                string.IsNullOrWhiteSpace(feed))
            {
                return false;
            }

            result = new VideoStreamTokenValidationResult
            {
                SessionId = sessionId,
                DomTarget = dom,
                SubTarget = sub,
                Feed = feed,
                JwtId = jwtId,
            };

            return true;
        }
        catch (SecurityTokenException)
        {
            return false;
        }
    }

    private VideoStreamFeedTokenDto MintFeedToken(
        string sessionId,
        string domTarget,
        string subTarget,
        string feed,
        string embedPath)
    {
        var expiresAt = DateTimeOffset.UtcNow.AddMinutes(_videoSettings.StreamTokenExpireMinutes);
        var jwtId = Guid.NewGuid().ToString("N");
        var signingCredentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSettings.Key)),
            SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Jti, jwtId),
            new Claim(ClaimNames.SessionId, sessionId),
            new Claim(ClaimNames.Dom, domTarget),
            new Claim(ClaimNames.Sub, subTarget),
            new Claim(ClaimNames.Feed, feed),
        };

        var jwt = new JwtSecurityToken(
            issuer: _jwtSettings.Issuer,
            audience: _videoSettings.StreamTokenAudience,
            claims: claims,
            expires: expiresAt.UtcDateTime,
            signingCredentials: signingCredentials);

        var token = _tokenHandler.WriteToken(jwt);
        RegisterSessionToken(sessionId, jwtId);

        return new VideoStreamFeedTokenDto
        {
            Feed = feed,
            Token = token,
            Url = AppendToken(embedPath, token),
            ExpiresAt = expiresAt,
        };
    }

    private void RegisterSessionToken(string sessionId, string jwtId)
    {
        var jwtIds = _sessionJwtIds.GetOrAdd(sessionId, _ => new ConcurrentDictionary<string, byte>(StringComparer.Ordinal));
        jwtIds.TryAdd(jwtId, 0);
    }

    private TokenValidationParameters CreateValidationParameters() =>
        new()
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = _jwtSettings.Issuer,
            ValidAudience = _videoSettings.StreamTokenAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSettings.Key)),
            ClockSkew = TimeSpan.FromMinutes(1),
        };

    internal static string AppendToken(string embedPath, string token)
    {
        var joiner = embedPath.Contains('?', StringComparison.Ordinal) ? '&' : '?';
        return $"{embedPath}{joiner}token={Uri.EscapeDataString(token)}";
    }

    internal static string BuildEmbedPath(string tunnelBaseUrl, string feed, string fallbackPath)
    {
        var basePath = string.IsNullOrWhiteSpace(tunnelBaseUrl)
            ? fallbackPath.Trim()
            : tunnelBaseUrl.Trim();

        if (basePath.Contains("src=", StringComparison.OrdinalIgnoreCase))
        {
            return basePath;
        }

        var joiner = basePath.Contains('?', StringComparison.Ordinal) ? '&' : '?';
        return $"{basePath}{joiner}src={feed}";
    }
}
