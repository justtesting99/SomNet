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
- **Device:** set `Device:BaseUrl` and `Device:Pin` before Phase 1+ runs against hardware
