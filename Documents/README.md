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
| [SignalR & Hardware](./06-SignalR-And-Hardware.md) | Developers | Hub protocol, pairing, command dispatch, firmware/UI status (synced 2026-09-10) |
| [Session & History](./07-Session-And-History.md) | Developers | Live session lifecycle, summaries, and timeline aggregation |
| [Development Guide](./08-Development-Guide.md) | Developers | Local setup, ports, build pipeline, and common tasks |
| [User Guide](./User-Guide.md) | Operators | How to use the web application day to day |
| [Hardware User Guide](./Hardware-User-Guide.md) | Installers / owners | ESP32 setup, Wi‑Fi provisioning, pairing, relay status (updated 2026-09-10) |
| [ESP32 Device Plan](./09-ESP32-Device-Plan.md) | Developers | **Source of truth** — firmware plan (Phases 0–12 signed off; firmware **`0.13.0-network`**) |
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
| [ESP32 Phase 9 Part 2 — Automatic](./09-ESP32-Phase-9-Part2-Automatic-Checklist.md) | Developers | Automatic mode UI rules, decisions (P9P2-D*), implementation checklist |
| [ESP32 Phase 10 Checklist](./09-ESP32-Phase-10-Checklist.md) | Developers | Burst-in-automatic — **Signed off** (2026-09-07) |
| [ESP32 Phase 11 Checklist](./09-ESP32-Phase-11-Checklist.md) | Developers | Live automatic settings (`automatic-update`) — **Signed off** (2026-09-10) |
| [ESP32 Phase 12 Checklist](./09-ESP32-Phase-12-Network-Hardening-Checklist.md) | Developers | Network hardening — **`0.13.0-network`** **signed off** (2026-09-10) |
| [UI Session Rehydration (automatic)](./10-UI-Session-Rehydration-Checklist.md) | Developers | Restore Stop/Abort after browser refresh during automatic session — **signed off** (2026-09-10) |
| [UI Manual Session Rehydration](./11-UI-Manual-Session-Rehydration-Checklist.md) | Developers | Restore manual event log after browser refresh — **signed off** (2026-09-11) |
| [UI Multi-Tab Sync](./12-UI-Multi-Tab-Sync-Checklist.md) | Developers | Coordinate live session/mode/sub across browser tabs — **signed off** (2026-09-11) |
| [Video & Camera Architecture](./13-Video-And-Camera-Architecture.md) | Developers / installers | Session-scoped streams, edge gateway (Pi), webcam/IP cameras, snapshots — **Phases 1–6 implemented (PC); Phase 7 next** |
| [Video Implementation Plan](./14-Video-Implementation-Plan.md) | Developers | Phases 1–8 roadmap — **Phases 2–6 complete; Phase 7 next; IP on hold** |
| [Video Phase 1 — Edge bench](./14-Video-Phase-1-Edge-Bench-Checklist.md) | Developers | go2rtc on PC — **partial sign-off** (Layout A-dev: 2× USB webcam) |
| [Video Phase 1c — Thingino G7 flash](./14-Video-Phase-1c-Thingino-G7-Flash-Checklist.md) | Developers | IP rear camera — **on hold** (V1-D9) |
| [Video Phase 1b — Galayou G7 setup](./14-Video-Phase-1b-Galayou-G7-Setup.md) | Developers | go2rtc rear wiring — **on hold** |
| [Video Phase 1c — Thingino G2 flash](./14-Video-Phase-1c-Thingino-G2-Flash-Checklist.md) | Developers | G2 pan/tilt fleet — **on hold** |
| [Video Phase 1b — Galayou G2 setup](./14-Video-Phase-1b-Galayou-G2-Setup.md) | Developers | G2 reference — **on hold** |
| [Video Phase 2 — UI embed](./15-Video-Phase-2-UI-Embed-Checklist.md) | Developers | Dashboard iframes — **complete** |
| [Video Phase 3 — Session tokens](./16-Video-Phase-3-Session-Tokens-Checklist.md) | Developers | API session-scoped tokens — **signed off** (T4 deferred) |
| [Video Phase 4 — Action snapshots](./17-Video-Phase-4-Action-Snapshots-Checklist.md) | Developers | Stills on ack (local storage) — **signed off** (manual v1) |
| [Video Phase 5 — Edge agent](./18-Video-Phase-5-Edge-Agent-Checklist.md) | Developers | Session lifecycle on gateway — **signed off** (2026-09-12) |
| [Video Phase 6 — Tunnel](./19-Video-Phase-6-Tunnel-Checklist.md) | Developers | **Cloudflare Tunnel** to dev PC API — **signed off** (2026-09-13; iPhone/LTE follow-up optional) |
| [Video Phase 7 — Pi production](./20-Video-Phase-7-Pi-Production-Checklist.md) | Developers | Pi 4/5 + 2× USB webcam (A-dev) E2E — **next** |
| [Video Phase 7b — Edge intercom (draft)](./22-Video-Phase-7b-Edge-Intercom-Draft.md) | Developers | Optional Pi headset audio — **draft**; phone primary; after Phase 7 video |
| [Video Phase 8 — Azure cutover](./21-Video-Phase-8-Azure-Cutover-Checklist.md) | Developers | App Service + SQL + Blob — blocked |
| [ESP32 Network Spec](./09-ESP32-Network-Spec.md) | Developers | **Wi‑Fi / HTTP / hub architecture** — signed off **`0.12.0-network`** (2026-09-09); S3–S6 verified |
