using System.Text.Json.Serialization;

namespace SomNet.Shared.Enums;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum EndSessionMode
{
    Minutes,
    Strokes,
    NoAutoEnd,
}
