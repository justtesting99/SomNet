# Video — Phase 8 Azure cutover

**Status:** **Blocked** — complete [Phase 7](./20-Video-Phase-7-Pi-Production-Checklist.md) first; full system ready

**Goal:** Deploy SomNet to **Azure** (App Service + SQL + **Blob** for snapshots); update ESP32 + pairing `tunnelBaseUrl`; **live video still via Pi tunnel** (not App Service egress).

See [13 §15 — When to deploy to Azure](./13-Video-And-Camera-Architecture.md#when-to-deploy-to-azure).

---

## Exit criteria (draft)

- Production URLs configured
- Blob replaces local/Azurite snapshot storage
- Session tokens + Pi tunnel E2E in production
- **Snapshot encryption at rest** — encrypted Blob objects; no plaintext JPEGs on disk or unprotected paths in SQL ([13 §Future](./13-Video-And-Camera-Architecture.md#future-snapshot-encryption-at-rest))
- Video implementation **signed off**

---

## Future work (from dev)

- [ ] **Encrypt action snapshot files at rest** — today dev stores plain JPEG under `data/snapshots/`; SQL stores `RelativePath` only. Production must not leave imagery readable from filesystem or DB access alone.
- [ ] Key management (Azure Key Vault / CMK for Blob; app envelope encryption for dev parity)
- [ ] API decrypt-on-serve only; audit access to snapshot endpoints

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial stub |
| 2026-09-12 | Future — snapshot encryption at rest added to exit criteria |
