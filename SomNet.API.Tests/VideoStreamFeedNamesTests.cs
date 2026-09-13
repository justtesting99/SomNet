using SomNet.API.Services;

namespace SomNet.API.Tests;

public class VideoStreamFeedNamesTests
{
    [Theory]
    [InlineData("front", "front")]
    [InlineData("front_medium", "front")]
    [InlineData("front_low", "front")]
    [InlineData("rear", "rear")]
    [InlineData("rear_medium", "rear")]
    [InlineData("rear_low", "rear")]
    public void NormalizeBaseFeed_maps_bandwidth_streams_to_base_feed(string src, string expected)
    {
        Assert.Equal(expected, VideoStreamFeedNames.NormalizeBaseFeed(src));
    }

    [Fact]
    public void FeedMatchesRequest_allows_front_medium_with_front_token()
    {
        Assert.True(VideoStreamFeedNames.FeedMatchesRequest("front", "front_medium"));
    }

    [Fact]
    public void FeedMatchesRequest_rejects_rear_src_with_front_token()
    {
        Assert.False(VideoStreamFeedNames.FeedMatchesRequest("front", "rear_low"));
    }
}
