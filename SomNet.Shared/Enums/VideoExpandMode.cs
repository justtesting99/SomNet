using System.Text.Json.Serialization;

namespace SomNet.Shared.Enums;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum VideoExpandMode
{
    None,
    Monitor1,
    Monitor2,
    Both,
}
