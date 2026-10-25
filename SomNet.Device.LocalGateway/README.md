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
- **Other routes:** header `X-SomNet-Device-Gateway-Key` (see `appsettings.json` → `Gateway:ApiKey`)
- **Device:** set `Device:BaseUrl` and `Device:Pin` in `appsettings.json` for hardware runs

## LocalClient (Phase 1)

`SomNet.Device.LocalClient` exposes `SomEspLocalClient` — register via `services.AddSomEspLocalClient()` (already wired in this host).

```csharp
await client.UnlockAsync();
await client.ArmAsync();
await client.SendCommandAsync("automatic-start", payloadJson);
var status = await client.GetLocalStatusAsync();
```

Unit tests: `dotnet test SomNet.Device.LocalClient.Tests`
