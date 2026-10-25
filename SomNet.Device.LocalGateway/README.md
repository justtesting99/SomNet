# SomNet.Device.LocalGateway

Lightweight HTTP API for scheduled jobs — proxies automatic sessions to SomEsp **`/api/local/*`**.

**Plan:** [Documents/29-Device-Local-Gateway-Implementation-Plan.md](../Documents/29-Device-Local-Gateway-Implementation-Plan.md)

## Run (dev)

```powershell
cd SomNet.Device.LocalGateway
dotnet run
```

- **URL:** http://localhost:5290
- **Health:** `GET /health` (no API key)
- **Metrics:** `GET /api/v1/gateway/metrics` (Prometheus text; API key required)
- **Stop in-flight run:** `POST /api/v1/automatic/stop` body `{ "abort": false }` (legacy, single device), or `POST /api/v1/devices/{deviceId}/automatic/stop`
- **Other routes:** header `X-SomNet-Device-Gateway-Key` (see `appsettings.json` → `Gateway:ApiKey`)
- **Device:** one ESP — `Device:DeviceId` (optional), `Device:BaseUrl`, `Device:Pin`; several ESPs — `Device:Devices[]` with `deviceId`, `baseUrl`, `pin` per entry (see doc 29 §P7-D2)

### Smoke (Phase 4) on Windows PowerShell

`curl` is an alias for `Invoke-WebRequest` and does **not** accept `-H`. Use **`curl.exe`** (real curl) or:

```powershell
$headers = @{ "X-SomNet-Device-Gateway-Key" = "SomNet-Dev-Device-Gateway-Key-2026" }
Invoke-RestMethod http://localhost:5290/health
Invoke-RestMethod http://localhost:5290/api/v1/device/status -Headers $headers
```

```powershell
curl.exe -H "X-SomNet-Device-Gateway-Key: SomNet-Dev-Device-Gateway-Key-2026" http://localhost:5290/api/v1/device/status
```

## Docker (Linux / compose)

*Deferred for now — use `dotnet run` on the laptop; files below are for when you enable compose.*

Build from the **SomNet repo root**:

```bash
docker build -f SomNet.Device.LocalGateway/Dockerfile -t somnet-device-local-gateway:local .
```

Or use the example compose file (loads secrets from `.env`):

```bash
cd SomNet.Device.LocalGateway
cp .env.example .env   # edit PIN, API key, ESP URL
docker compose -f docker-compose.example.yml up --build
```

### Configuration via environment (P5-D4)

ASP.NET Core binds nested settings with `__`:

| Environment variable | Maps to |
|---------------------|---------|
| `Gateway__ApiKey` | `Gateway:ApiKey` |
| `Device__BaseUrl` | `Device:BaseUrl` |
| `Device__Pin` | `Device:Pin` |
| `Device__PollIntervalMs` | `Device:PollIntervalMs` |

Do **not** put PIN or gateway API key in the image. Use compose `environment`, Docker secrets, or your orchestrator.

`appsettings.Production.json` ships with empty secrets; override at runtime.

### LAN networking (ESP on Wi‑Fi)

The gateway container must reach the ESP **on the LAN**, not `localhost` on the host.

| Approach | When to use |
|----------|-------------|
| **`Device__BaseUrl=http://<esp-lan-ip>`** (default) | Bridge network: container routes to the same Wi‑Fi/LAN as the host. Set the ESP’s current DHCP address (or static IP). |
| **`network_mode: host`** (Linux only) | Gateway shares the host network stack; `Device__BaseUrl` can use the same IP you use on the host. Not available on Docker Desktop for Windows/Mac. |
| **Static IP / DHCP reservation** | Reduces drift when the ESP reboots. |

**Avoid** relying on `host.docker.internal` to reach the ESP on **Linux** — that name points at the Docker host, not arbitrary LAN devices, and is inconsistent across platforms.

If the main app runs in another container on the same compose network, it calls the gateway by **service name**, not the ESP:

```json
"DeviceGateway": {
  "BaseUrl": "http://somnet-device-local-gateway:5290",
  "ApiKey": "<same as Gateway__ApiKey>"
}
```

Main app integration: **`AddDeviceGatewayClient()`** in `SomNet.Device.LocalClient` — see [Documents/30-Main-App-Device-Gateway-Integration.md](../Documents/30-Main-App-Device-Gateway-Integration.md).

### Health check

- **In image:** `GET /health` (Docker `HEALTHCHECK`)
- **Compose:** see `docker-compose.example.yml` `healthcheck` block

## LocalClient (Phase 1)

`SomNet.Device.LocalClient` exposes `SomEspLocalClient` — register via `services.AddSomEspLocalClient()` (already wired in this host).

```csharp
await client.UnlockAsync();
await client.ArmAsync();
await client.SendCommandAsync("automatic-start", payloadJson);
var status = await client.GetLocalStatusAsync();
```

Unit tests: `dotnet test SomNet.Device.LocalClient.Tests`

## Job runner (Phase 2)

```csharp
var runner = serviceProvider.GetRequiredService<AutomaticDeviceJobRunner>();
var result = await runner.RunAutomaticAsync(
    parameters,
    new AutomaticDeviceJobRunOptions { WaitTimeout = TimeSpan.FromHours(2), DisarmAfterRun = true });
// result.Status, result.Message, result.Result, result.RawResultJson
```
