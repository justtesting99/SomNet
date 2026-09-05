# SomNet.Device — ESP32 Firmware

PlatformIO firmware for the SomNet hardware device (ESP32 DevKit V1 clone). Lives in the SomNet repo but is **not** part of the .NET solution — build with PlatformIO in Cursor/VS Code or the `pio` CLI.

**Protocol:** [docs/PROTOCOL.md](docs/PROTOCOL.md)  
**Plan:** [Documents/09-ESP32-Device-Plan.md](../Documents/09-ESP32-Device-Plan.md)  
**Phase 1 checklist:** [Documents/09-ESP32-Phase-1-Checklist.md](../Documents/09-ESP32-Phase-1-Checklist.md)

## Hardware (default wiring)

| Silkscreen | GPIO | Role |
|------------|------|------|
| D4 | 4 | Relay |
| D33 | 33 | Button (input, pull-up) |

Change pins and relay polarity only in **`include/boardDefs.h`**.

## Prerequisites

- [PlatformIO](https://platformio.org/) (CLI or IDE extension)
- USB driver for CP2102 or CH340
- ESP32 DevKit connected

## Wi-Fi and server config (dev)

1. Copy `secrets.ini.example` → `secrets.ini` (gitignored — **never commit**).
2. Set `wifi_ssid`, `wifi_password`, and `somnet_server_host` (PC LAN IP — not `localhost` from the ESP32’s perspective).

`secrets.ini` is listed in the repo root `.gitignore`. If you ever accidentally staged it, run `git rm --cached SomNet.Device/secrets.ini` before pushing.

```ini
[secrets]
wifi_ssid = MyNetwork
wifi_password = MyPassword
somnet_server_host = 192.168.1.100
somnet_server_port = 5031
```

## Build and flash

From this directory:

```bash
pio run
pio run -t upload
pio device monitor
```

Or use the PlatformIO sidebar: **Build**, **Upload**, **Monitor** (115200 baud).

## Phase 1 behavior

- Serial banner with firmware version and placeholder device ID
- Non-blocking Wi-Fi connect with exponential backoff retry
- Stub modules for SignalR, NVS identity, config UI, and command execution (later phases)

## Log prefixes

| Prefix | Module |
|--------|--------|
| `[BOOT]` | Startup |
| `[WIFI]` | Wi-Fi manager |
| `[CMD]` | Command handler |
| `[RELAY]` | Relay controller (Phase 6+) |
| `[BTN]` | Button input |

## Project layout

```
include/          boardDefs.h, config.h
src/              firmware modules + modes/
docs/             PROTOCOL.md
tools/            Phase 0 capture scripts (Node, not part of firmware build)
```
