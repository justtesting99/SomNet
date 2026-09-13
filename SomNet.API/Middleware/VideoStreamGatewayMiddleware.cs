using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using SomNet.API.Configuration;
using SomNet.API.Services;

namespace SomNet.API.Middleware;

public sealed class VideoStreamGatewayMiddleware
{
    internal const string VideoAccessCookieName = "somnet-video-access";
    private readonly RequestDelegate _next;
    private readonly VideoEdgeSettings _settings;
    private readonly IMemoryCache _cache;

    public VideoStreamGatewayMiddleware(
        RequestDelegate next,
        IOptions<VideoEdgeSettings> settings,
        IMemoryCache cache)
    {
        _next = next;
        _settings = settings.Value;
        _cache = cache;
    }

    public async Task InvokeAsync(HttpContext context, IVideoStreamTokenService tokenService)
    {
        if (!_settings.RequireTokenForGo2Rtc ||
            !context.Request.Path.StartsWithSegments("/go2rtc", out var remainder))
        {
            await _next(context);
            return;
        }

        var path = remainder.Value ?? string.Empty;
        if (IsPublicAsset(path))
        {
            await _next(context);
            return;
        }

        if (TryAuthorize(context, tokenService, out var validation))
        {
            IssueAccessCookie(context, validation!);
            await _next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsync("Video stream access requires a valid session token.");
    }

    private bool TryAuthorize(
        HttpContext context,
        IVideoStreamTokenService tokenService,
        out VideoStreamTokenValidationResult? validation)
    {
        validation = null;

        var token = context.Request.Query["token"].ToString().Trim();
        if (!string.IsNullOrWhiteSpace(token) &&
            tokenService.TryValidateToken(token, out validation) &&
            FeedMatchesRequest(context, validation!.Feed))
        {
            return true;
        }

        if (context.Request.Cookies.TryGetValue(VideoAccessCookieName, out var cookieValue) &&
            _cache.TryGetValue(cookieValue, out VideoStreamTokenValidationResult? cached) &&
            cached is not null &&
            FeedMatchesRequest(context, cached.Feed))
        {
            validation = cached;
            return true;
        }

        return false;
    }

    private static bool FeedMatchesRequest(HttpContext context, string feed)
    {
        var requestedFeed = context.Request.Query["src"].ToString();
        if (string.IsNullOrWhiteSpace(requestedFeed))
        {
            return true;
        }

        return string.Equals(requestedFeed.Trim(), feed.Trim(), StringComparison.OrdinalIgnoreCase);
    }

    private void IssueAccessCookie(HttpContext context, VideoStreamTokenValidationResult validation)
    {
        var cacheKey = $"{validation.SessionId}:{validation.JwtId}";
        _cache.Set(cacheKey, validation, TimeSpan.FromMinutes(35));

        context.Response.OnStarting(() =>
        {
            context.Response.Cookies.Append(
                VideoAccessCookieName,
                cacheKey,
                new CookieOptions
                {
                    HttpOnly = true,
                    SameSite = SameSiteMode.Lax,
                    IsEssential = true,
                    MaxAge = TimeSpan.FromMinutes(35),
                });

            return Task.CompletedTask;
        });
    }

    private static bool IsPublicAsset(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return false;
        }

        return path.EndsWith(".js", StringComparison.OrdinalIgnoreCase) ||
            path.EndsWith(".css", StringComparison.OrdinalIgnoreCase) ||
            path.EndsWith(".svg", StringComparison.OrdinalIgnoreCase) ||
            path.EndsWith(".png", StringComparison.OrdinalIgnoreCase) ||
            path.EndsWith(".woff2", StringComparison.OrdinalIgnoreCase);
    }
}
