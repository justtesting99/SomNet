using System.Text.Json;
using System.Text.Json.Nodes;
using SomNet.Shared.DTO.Modes;
using SomNet.Shared.DTO.Options;
using SomNet.Shared.Enums;
using SomNet.Shared.Serialization;

namespace SomNet.Shared.Modes;

/// <summary>
/// Builds motor <c>automatic-start</c> JSON (hub + LAN gateway parity — SomNet.UI <c>buildMotorAutomaticStartPayload</c>).
/// </summary>
public static class MotorAutomaticStartPayloadBuilder
{
    public static string BuildJson(
        MotorAutomaticControlStateDto state,
        AppOptionsDto? appOptions = null)
    {
        var node = JsonSerializer.SerializeToNode(state, SomNetJsonOptions.Default) as JsonObject
            ?? throw new InvalidOperationException("Failed to serialize motor automatic parameters.");

        node.Remove("running");

        var endMode = state.EndSessionMode;
        if (endMode == EndSessionMode.Strokes)
        {
            node["endSessionMode"] = JsonValue.Create("noAutoEnd");
        }

        node["actuatorKind"] = JsonValue.Create("hbridge");
        node["segmentTargetRampMs"] = JsonValue.Create(
            MotorSegmentTargetRampResolver.ResolveSegmentTargetRampMs(state.AutomaticMode, appOptions));

        return node.ToJsonString(SomNetJsonOptions.Default);
    }
}
