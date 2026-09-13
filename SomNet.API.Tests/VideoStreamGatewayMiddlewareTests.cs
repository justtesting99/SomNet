using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using SomNet.API.Configuration;
using SomNet.API.Middleware;
using SomNet.API.Services;

namespace SomNet.API.Tests;

public class VideoStreamGatewayMiddlewareTests
{
    [Fact]
    public async Task InvokeAsync_allows_go2rtc_when_token_is_valid()
    {
        var tokenService = VideoStreamTokenServiceTests.CreateService();
        var tokens = tokenService.MintSessionTokens(
            "sess-gw-1",
            "DomA",
            "Sub1",
            "/go2rtc/stream.html?src=front",
            "/go2rtc/stream.html?src=rear");

        var context = new DefaultHttpContext();
        context.Request.Path = "/go2rtc/stream.html";
        context.Request.QueryString = new QueryString("?src=front&token=" + Uri.EscapeDataString(tokens.Front.Token));

        var invoked = false;
        RequestDelegate next = _ =>
        {
            invoked = true;
            return Task.CompletedTask;
        };

        var middleware = new VideoStreamGatewayMiddleware(
            next,
            Options.Create(new VideoEdgeSettings { RequireTokenForGo2Rtc = true }),
            new MemoryCache(new MemoryCacheOptions()));

        await middleware.InvokeAsync(context, tokenService);

        Assert.True(invoked);
        Assert.Equal(200, context.Response.StatusCode);
    }

    [Fact]
    public async Task InvokeAsync_blocks_go2rtc_without_token()
    {
        var tokenService = VideoStreamTokenServiceTests.CreateService();
        var context = new DefaultHttpContext();
        context.Request.Path = "/go2rtc/stream.html";
        context.Request.QueryString = new QueryString("?src=front");

        var invoked = false;
        RequestDelegate next = _ =>
        {
            invoked = true;
            return Task.CompletedTask;
        };

        var middleware = new VideoStreamGatewayMiddleware(
            next,
            Options.Create(new VideoEdgeSettings { RequireTokenForGo2Rtc = true }),
            new MemoryCache(new MemoryCacheOptions()));

        await middleware.InvokeAsync(context, tokenService);

        Assert.False(invoked);
        Assert.Equal(StatusCodes.Status403Forbidden, context.Response.StatusCode);
    }

    [Fact]
    public async Task InvokeAsync_allows_bandwidth_tier_src_when_token_feed_matches_base()
    {
        var tokenService = VideoStreamTokenServiceTests.CreateService();
        var tokens = tokenService.MintSessionTokens(
            "sess-gw-2",
            "DomA",
            "Sub1",
            "/go2rtc/stream.html?src=front",
            "/go2rtc/stream.html?src=rear");

        var context = new DefaultHttpContext();
        context.Request.Path = "/go2rtc/stream.html";
        context.Request.QueryString = new QueryString(
            "?src=front_medium&token=" + Uri.EscapeDataString(tokens.Front.Token));

        var invoked = false;
        RequestDelegate next = _ =>
        {
            invoked = true;
            return Task.CompletedTask;
        };

        var middleware = new VideoStreamGatewayMiddleware(
            next,
            Options.Create(new VideoEdgeSettings { RequireTokenForGo2Rtc = true }),
            new MemoryCache(new MemoryCacheOptions()));

        await middleware.InvokeAsync(context, tokenService);

        Assert.True(invoked);
        Assert.Equal(200, context.Response.StatusCode);
    }
}
