using System.Net;
using System.Net.NetworkInformation;
using Microsoft.Extensions.Options;
using SomNet.API.Configuration;

namespace SomNet.API.Services;

/// <summary>
/// Dev LAN helper: ping ESP32 devices while disconnected so inbound traffic populates
/// the device ARP cache for this API host (fixes reconnect when only PC→device path works first).
/// </summary>
public sealed class DeviceReachabilityBackgroundService : BackgroundService
{
    private readonly IDeviceConnectionRegistry _registry;
    private readonly HardwareReachabilityOptions _options;
    private readonly ILogger<DeviceReachabilityBackgroundService> _logger;

    public DeviceReachabilityBackgroundService(
        IDeviceConnectionRegistry registry,
        IOptions<HardwareReachabilityOptions> options,
        ILogger<DeviceReachabilityBackgroundService> logger)
    {
        _registry = registry;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled)
        {
            return;
        }

        var interval = TimeSpan.FromSeconds(Math.Clamp(_options.IntervalSeconds, 5, 300));
        var configured = _options.DeviceIps
            .Where(ip => !string.IsNullOrWhiteSpace(ip))
            .Select(ip => ip.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (configured.Length == 0)
        {
            _logger.LogWarning(
                "Hardware reachability ping is enabled but Hardware:ReachabilityPing:DeviceIps is empty.");
        }
        else
        {
            _logger.LogInformation(
                "Hardware reachability ping enabled every {IntervalSeconds}s for [{DeviceIps}] while no device is connected.",
                (int)interval.TotalSeconds,
                string.Join(", ", configured));
        }

        using var ping = new Ping();

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(interval, stoppingToken);

                if (_registry.IsAnyDeviceConnected())
                {
                    continue;
                }

                var targets = configured
                    .Concat(_registry.GetLastKnownDeviceIps())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToArray();

                foreach (var target in targets)
                {
                    if (_registry.IsAnyDeviceConnected())
                    {
                        break;
                    }

                    if (!IPAddress.TryParse(target, out var address))
                    {
                        continue;
                    }

                    try
                    {
                        var reply = await ping.SendPingAsync(address, 1000);
                        if (reply.Status == IPStatus.Success)
                        {
                            _logger.LogDebug("Reachability ping ok {DeviceIp} ({RoundtripMs} ms)", target, reply.RoundtripTime);
                        }
                        else
                        {
                            _logger.LogDebug("Reachability ping {DeviceIp} status={Status}", target, reply.Status);
                        }
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        _logger.LogDebug(ex, "Reachability ping failed {DeviceIp}", target);
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }
}
