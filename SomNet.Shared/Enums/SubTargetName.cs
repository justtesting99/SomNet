using System.Text.Json;
using System.Text.Json.Serialization;

namespace SomNet.Shared.Enums;

[JsonConverter(typeof(SubTargetNameJsonConverter))]
public enum SubTargetName
{
    Slv66,
    Slv67,
    Slv68,
}

public sealed class SubTargetNameJsonConverter : JsonConverter<SubTargetName>
{
    public override SubTargetName Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var value = reader.GetString();
        return value switch
        {
            "Slv66" => SubTargetName.Slv66,
            "Slv67" => SubTargetName.Slv67,
            "Slv68" => SubTargetName.Slv68,
            _ => throw new JsonException($"Unknown sub target: {value}"),
        };
    }

    public override void Write(Utf8JsonWriter writer, SubTargetName value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(value switch
        {
            SubTargetName.Slv66 => "Slv66",
            SubTargetName.Slv67 => "Slv67",
            SubTargetName.Slv68 => "Slv68",
            _ => throw new JsonException($"Unknown sub target: {value}"),
        });
    }
}
