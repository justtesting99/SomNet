using Microsoft.Extensions.Options;
using SomNet.API.Configuration;
using SomNet.API.Services;

namespace SomNet.API.Tests;

public class VideoStreamTokenServiceTests
{
    internal static VideoStreamTokenService CreateService()
    {
        var jwtSettings = Options.Create(new JwtSettings
        {
            Key = "SomNet-Dev-Jwt-Signing-Key-Change-For-Production-2026",
            Issuer = "SomNet",
            Audience = "SomNet.UI",
            DeviceAudience = "SomNet.Device",
        });

        var videoSettings = Options.Create(new VideoStreamSettings
        {
            StreamTokenExpireMinutes = 30,
            StreamTokenAudience = "SomNet.VideoStream",
        });

        return new VideoStreamTokenService(jwtSettings, videoSettings);
    }

    [Fact]
    public void MintSessionTokens_includes_session_dom_sub_and_feed_claims()
    {
        var service = CreateService();

        var response = service.MintSessionTokens(
            "sess-001",
            "DomA",
            "Sub1",
            "/go2rtc/stream.html?src=front",
            "/go2rtc/stream.html?src=rear");

        Assert.True(service.TryValidateToken(response.Front.Token, out var frontClaims));
        Assert.NotNull(frontClaims);
        Assert.Equal("sess-001", frontClaims.SessionId);
        Assert.Equal("DomA", frontClaims.DomTarget);
        Assert.Equal("Sub1", frontClaims.SubTarget);
        Assert.Equal("front", frontClaims.Feed);

        Assert.True(service.TryValidateToken(response.Rear.Token, out var rearClaims));
        Assert.NotNull(rearClaims);
        Assert.Equal("rear", rearClaims.Feed);
    }

    [Fact]
    public void MintSessionTokens_does_not_revoke_previous_tokens()
    {
        var service = CreateService();

        var first = service.MintSessionTokens(
            "sess-remint",
            "DomA",
            "Sub1",
            "/go2rtc/stream.html?src=front",
            "/go2rtc/stream.html?src=rear");

        var second = service.MintSessionTokens(
            "sess-remint",
            "DomA",
            "Sub1",
            "/go2rtc/stream.html?src=front",
            "/go2rtc/stream.html?src=rear");

        Assert.True(service.TryValidateToken(first.Front.Token, out _));
        Assert.True(service.TryValidateToken(first.Rear.Token, out _));
        Assert.True(service.TryValidateToken(second.Front.Token, out _));
        Assert.True(service.TryValidateToken(second.Rear.Token, out _));
    }

    [Fact]
    public void RevokeSession_invalidates_previously_minted_tokens()
    {
        var service = CreateService();

        var response = service.MintSessionTokens(
            "sess-002",
            "DomA",
            "Sub1",
            "/go2rtc/stream.html?src=front",
            "/go2rtc/stream.html?src=rear");

        service.RevokeSession("sess-002");

        Assert.False(service.TryValidateToken(response.Front.Token, out _));
        Assert.False(service.TryValidateToken(response.Rear.Token, out _));
    }

    [Fact]
    public void BuildEmbedPath_appends_feed_when_base_has_no_src()
    {
        var path = VideoStreamTokenService.BuildEmbedPath(
            "/go2rtc/stream.html",
            "rear",
            "/fallback?src=rear");

        Assert.Equal("/go2rtc/stream.html?src=rear", path);
    }

    [Fact]
    public void AppendToken_adds_query_parameter()
    {
        var url = VideoStreamTokenService.AppendToken("/go2rtc/stream.html?src=front", "abc.def");

        Assert.Equal("/go2rtc/stream.html?src=front&token=abc.def", url);
    }
}
