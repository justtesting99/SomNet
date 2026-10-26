namespace SomNet.Shared.Enums;

/// <summary>Device output profile (relay vs H-bridge motor). Wire JSON: relay | hbridge.</summary>
public enum ActuatorKind
{
    Relay,
    Hbridge,
}
