using SomNet.API.Services;
using SomNet.Shared.Enums;

namespace SomNet.API.Tests;

public class VideoSnapshotServiceTests
{
    [Theory]
    [InlineData(ActionSnapshotFeeds.Both, "front", true)]
    [InlineData(ActionSnapshotFeeds.Both, "rear", true)]
    [InlineData(ActionSnapshotFeeds.Rear, "front", false)]
    [InlineData(ActionSnapshotFeeds.Rear, "rear", true)]
    public void ShouldCaptureFeed_respects_action_snapshot_feeds_preference(
        ActionSnapshotFeeds feeds,
        string feed,
        bool expected)
    {
        Assert.Equal(expected, VideoSnapshotService.ShouldCaptureFeed(feeds, feed));
    }

    [Fact]
    public void BuildRelativePath_uses_action_index_and_feed()
    {
        var path = VideoSnapshotService.BuildRelativePath("Dom A", "sess-001", 2, "rear");

        Assert.Equal(Path.Combine("Dom A", "sess-001", "002-rear.jpg"), path);
    }

    [Fact]
    public void SanitizePathSegment_replaces_invalid_characters()
    {
        Assert.Equal("Dom_A_test", VideoSnapshotService.SanitizePathSegment("Dom:A/test"));
    }
}
