using SomNet.Shared.DTO.DeviceGateway;
using SomNet.Shared.Enums;

namespace SomNet.Shared.DeviceGateway;

public static class AutomaticRunRequestValidator
{
    public sealed record ValidationResult(bool IsValid, string? ErrorCode, string? Message);

    /// <summary>
    /// Validates run body against device caps / registration kind (M3-G2).
    /// </summary>
    public static ValidationResult Validate(AutomaticRunRequestDto? request, ActuatorKind deviceKind)
    {
        if (request is null)
        {
            return Invalid("body_required", "Request body is required.");
        }

        var profile = ResolveProfile(request, deviceKind);

        if (profile == ActuatorKind.Hbridge)
        {
            if (request.Parameters is not null && request.MotorParameters is null)
            {
                return Invalid(
                    "relay_payload_on_motor_device",
                    "Relay automatic parameters cannot be used on a motor (hbridge) device. Send motorParameters.");
            }

            return Valid();
        }

        if (request.MotorParameters is not null)
        {
            return Invalid(
                "motor_payload_on_relay_device",
                "Motor parameters cannot be used on a relay device.");
        }

        if (request.Parameters is null)
        {
            return Invalid("parameters_required", "Relay parameters are required for this device.");
        }

        return Valid();
    }

    public static ActuatorKind ResolveProfile(AutomaticRunRequestDto request, ActuatorKind deviceKind)
    {
        if (request.MotorParameters is not null)
        {
            return ActuatorKind.Hbridge;
        }

        if (deviceKind == ActuatorKind.Hbridge)
        {
            return ActuatorKind.Hbridge;
        }

        return ActuatorKind.Relay;
    }

    private static ValidationResult Valid() => new(true, null, null);

    private static ValidationResult Invalid(string code, string message) =>
        new(false, code, message);
}
