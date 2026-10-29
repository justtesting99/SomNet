namespace SomNet.Shared.Enums;

/// <summary>How <c>burstPercent</c> maps to burst events (doc 36).</summary>
public enum BurstPlacement
{
    /// <summary>Legacy wire value — main stroke then burst (session spread).</summary>
    SessionSpread,
    /// <summary>Legacy — main then burst after evenly spaced mains.</summary>
    AfterMainStroke,
    /// <summary>Legacy — main then chance burst after each main.</summary>
    ChanceAfterMainStroke,
    MainPlusSessionSpread,
    MainPlusAfterMainStroke,
    MainPlusChanceAfterMainStroke,
    InsteadOfSessionSpread,
    InsteadOfAfterMainStroke,
    InsteadOfChanceAfterMainStroke,
}
