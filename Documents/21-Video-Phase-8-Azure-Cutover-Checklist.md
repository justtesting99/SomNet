# Video — Phase 8 Azure cutover

**Status:** **Blocked** — complete [Phase 7](./20-Video-Phase-7-Pi-Production-Checklist.md) first; full system ready

**Goal:** Deploy SomNet to **Azure** (App Service + SQL + **Blob** for snapshots); update ESP32 + pairing `tunnelBaseUrl`; **live video still via Pi tunnel** (not App Service egress).

See [13 §15 — When to deploy to Azure](./13-Video-And-Camera-Architecture.md#when-to-deploy-to-azure).

---

## Exit criteria (draft)

- Production URLs configured
- Blob replaces local/Azurite snapshot storage
- Session tokens + Pi tunnel E2E in production
- Video implementation **signed off**

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial stub |
