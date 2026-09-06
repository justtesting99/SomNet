# SomNet Documentation

Technical and user documentation for SomNet. For project overview and quick start, see the [root README](../README.md).

## Document Index

| Document | Audience | Description |
|----------|----------|-------------|
| [System Overview](./01-System-Overview.md) | All | High-level architecture, major components, and data flows |
| [API Reference](./02-API-Reference.md) | Developers | REST endpoints, request/response shapes, and controller behavior |
| [Frontend Architecture](./03-Frontend-Architecture.md) | Developers | React provider tree, UI modes, dialogs, and client-side state |
| [Database Schema](./04-Database-Schema.md) | Developers | Entities, relationships, migrations, and seed data |
| [Authentication & Security](./05-Authentication-And-Security.md) | Developers | Operator JWT, device tokens, and authorization model |
| [SignalR & Hardware](./06-SignalR-And-Hardware.md) | Developers | Hub protocol, pairing, command dispatch, firmware/UI status (synced 2026-09-05) |
| [Session & History](./07-Session-And-History.md) | Developers | Live session lifecycle, summaries, and timeline aggregation |
| [Development Guide](./08-Development-Guide.md) | Developers | Local setup, ports, build pipeline, and common tasks |
| [User Guide](./User-Guide.md) | Operators | How to use the web application day to day |
| [Hardware User Guide](./Hardware-User-Guide.md) | Installers / owners | ESP32 setup, Wi‑Fi provisioning, pairing, relay status (updated 2026-09-05) |
| [ESP32 Device Plan](./09-ESP32-Device-Plan.md) | Developers | **Source of truth** — firmware plan (Phases 0–5 complete, Phase 6 signed off) |
| [ESP32 Phase 0 Checklist](./09-ESP32-Phase-0-Checklist.md) | Developers | Protocol capture — **Complete** (2026-09-05) |
| [ESP32 Phase 1 Checklist](./09-ESP32-Phase-1-Checklist.md) | Developers | PlatformIO scaffold — **Complete** (2026-09-05) |
| [ESP32 Phase 2 Checklist](./09-ESP32-Phase-2-Checklist.md) | Developers | NVS + MAC device identity — **Complete** (2026-09-05) |
| [ESP32 Phase 3 Checklist](./09-ESP32-Phase-3-Checklist.md) | Developers | Config web UI + registration UX — **Complete** (2026-09-05) |
| [ESP32 Phase 4 Checklist](./09-ESP32-Phase-4-Checklist.md) | Developers | SignalR client + pairing — **Complete** (2026-09-05) |
| [ESP32 Phase 5 Checklist](./09-ESP32-Phase-5-Checklist.md) | Developers | Single-pulse command + ack — **Complete** (2026-09-05; busy reject E2E → Phase 8) |
| [ESP32 Phase 6 Checklist](./09-ESP32-Phase-6-Checklist.md) | Developers | Relay GPIO — **Signed off** (2026-09-05; abort E2E → Phase 8) |
| [ESP32 Phase 7 Checklist](./09-ESP32-Phase-7-Checklist.md) | Developers | Resilience / production prep — **Signed off** (2026-09-06) |
| [ESP32 Phase 8 Checklist](./09-ESP32-Phase-8-Checklist.md) | Developers | UI commands + pairing polish — **Signed off** (2026-09-06) |
| [ESP32 Phase 9 Checklist](./09-ESP32-Phase-9-Checklist.md) | Developers | Burst mode — **Signed off** (2026-09-06); automatic Part 2 exploratory |
