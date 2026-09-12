using SomNet.API.Services;

namespace SomNet.API.Tests;

public class VideoSnapshotServiceTests
{
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
