using Microsoft.Extensions.Options;

namespace SomNet.Device.LocalClient;

public interface IConfiguredDeviceRegistry
{
    IReadOnlyList<ResolvedDeviceEntry> All { get; }

    bool IsSingleDevice { get; }

    ResolvedDeviceEntry GetRequired(string deviceId);

    bool TryGet(string deviceId, out ResolvedDeviceEntry? entry);
}

public sealed class ConfiguredDeviceRegistry : IConfiguredDeviceRegistry
{
    public const string LegacyDefaultDeviceId = "default";

    private readonly IReadOnlyList<ResolvedDeviceEntry> _devices;
    private readonly Dictionary<string, ResolvedDeviceEntry> _byId;

    public ConfiguredDeviceRegistry(IOptions<ConfiguredDeviceOptions> options)
    {
        var value = options.Value;
        _devices = BuildEntries(value);
        _byId = _devices.ToDictionary(
            d => NormalizeKey(d.DeviceId),
            d => d,
            StringComparer.Ordinal);
    }

    public IReadOnlyList<ResolvedDeviceEntry> All => _devices;

    public bool IsSingleDevice => _devices.Count == 1;

    public ResolvedDeviceEntry GetRequired(string deviceId)
    {
        if (!TryGet(deviceId, out var entry) || entry is null)
        {
            throw new UnknownConfiguredDeviceException(deviceId);
        }

        return entry;
    }

    public bool TryGet(string deviceId, out ResolvedDeviceEntry? entry)
    {
        if (string.IsNullOrWhiteSpace(deviceId))
        {
            entry = null;
            return false;
        }

        return _byId.TryGetValue(NormalizeKey(deviceId), out entry);
    }

    internal static IReadOnlyList<ResolvedDeviceEntry> BuildEntries(ConfiguredDeviceOptions options)
    {
        var poll = options.PollIntervalMs > 0 ? options.PollIntervalMs : 800;
        var timeout = options.HttpTimeout;

        if (options.Devices.Count > 0)
        {
            var list = new List<ResolvedDeviceEntry>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var device in options.Devices)
            {
                if (string.IsNullOrWhiteSpace(device.DeviceId))
                {
                    throw new InvalidOperationException("Device:Devices[] entry requires deviceId.");
                }

                if (string.IsNullOrWhiteSpace(device.BaseUrl))
                {
                    throw new InvalidOperationException(
                        $"Device:Devices[] entry '{device.DeviceId}' requires baseUrl.");
                }

                if (!seen.Add(device.DeviceId))
                {
                    throw new InvalidOperationException(
                        $"Duplicate deviceId in Device:Devices[]: '{device.DeviceId}'.");
                }

                list.Add(new ResolvedDeviceEntry(
                    device.DeviceId.Trim(),
                    device.BaseUrl.Trim(),
                    device.Pin ?? string.Empty,
                    poll,
                    timeout));
            }

            return list;
        }

        if (string.IsNullOrWhiteSpace(options.BaseUrl))
        {
            throw new InvalidOperationException(
                "Configure Device:BaseUrl or Device:Devices[] with at least one ESP.");
        }

        var legacyId = string.IsNullOrWhiteSpace(options.DeviceId)
            ? LegacyDefaultDeviceId
            : options.DeviceId.Trim();

        return new[]
        {
            new ResolvedDeviceEntry(
                legacyId,
                options.BaseUrl.Trim(),
                options.Pin ?? string.Empty,
                poll,
                timeout),
        };
    }

    private static string NormalizeKey(string deviceId) => deviceId.Trim();
}

public sealed class UnknownConfiguredDeviceException : Exception
{
    public UnknownConfiguredDeviceException(string deviceId)
        : base($"Unknown deviceId '{deviceId}'. Configure Device:Devices[] or check the id.")
    {
        DeviceId = deviceId;
    }

    public string DeviceId { get; }
}
