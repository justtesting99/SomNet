# Video — Snapshot encryption at rest (dev / pre-Pi)

**Status:** **Signed off** (2026-09-13) — local disk AES-256-GCM; Azure Blob CMK deferred to [Phase 8](./21-Video-Phase-8-Azure-Cutover-Checklist.md)

**Goal:** Action snapshot JPEGs under `data/snapshots/` are **not readable as plain image files** on disk. API **decrypts on serve only** via authenticated `GET /api/video/snapshots/{id}/image`. **Legacy plain JPEG** files from Phase 4 still load.

| Related | Link |
|---------|------|
| Phase 4 snapshots | [17 — Action snapshots](./17-Video-Phase-4-Action-Snapshots-Checklist.md) |
| Architecture | [13 §Snapshot encryption](./13-Video-And-Camera-Architecture.md#snapshot-encryption-at-rest) |
| Phase 8 (Azure) | [21 — Azure cutover](./21-Video-Phase-8-Azure-Cutover-Checklist.md) |

---

## Locked decisions

| ID | Decision | Choice | Date |
|----|----------|--------|------|
| **ENC-D1** | Algorithm | **AES-256-GCM** envelope (`SNAP` v1 file header) | 2026-09-13 |
| **ENC-D2** | Key (dev) | `Video:Snapshots:EncryptionKeyBase64` — 32-byte key, Base64 | 2026-09-13 |
| **ENC-D3** | Default | **`EncryptAtRest: true`** in dev; production key via config / Key Vault (Phase 8) | 2026-09-13 |
| **ENC-D4** | Legacy files | Plain JPEG (`FF D8 FF`) on disk still served — no migration required | 2026-09-13 |
| **ENC-D5** | SQL | Still **metadata only** (`RelativePath`); no image blobs in DB | 2026-09-13 |
| **ENC-D6** | Path names | Unchanged (`{actionIndex}-{feed}.jpg`); **content** encrypted | 2026-09-13 |
| **ENC-D7** | Capture quality | go2rtc `frame.jpeg?width=1920` (`FrameCaptureMaxWidth`); encryption is lossless | 2026-09-13 |

---

## Configuration

`Video:Snapshots` in `appsettings.Development.json`:

```json
"EncryptAtRest": true,
"EncryptionKeyBase64": "U29tTmV0LURldi1TbmFwc2hvdC1LZXktMzJieXRlcyE="
```

(Dev-only key — **change for production**; never commit production keys.)

Generate a new 32-byte key:

```powershell
[Convert]::ToBase64String([byte[]](1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

Set `EncryptAtRest: false` only for temporary debugging (writes plain JPEG again).

---

## Implementation

| Component | Path |
|-----------|------|
| Settings | `VideoSnapshotSettings.EncryptAtRest`, `EncryptionKeyBase64` |
| Crypto | `SnapshotFileProtection` / `ISnapshotFileProtection` |
| Capture | `VideoSnapshotService` — `Protect()` before `File.WriteAllBytesAsync` |
| Serve | `VideoSnapshotService.GetImageAsync` → `Unprotect()` → `File(jpegBytes)` |
| Startup | `ValidateOnStart` — key required when encryption enabled |
| Tests | `SnapshotFileProtectionTests.cs` |

---

## Smoke tests

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **ENC-T1** | Stroke → ack → new snapshot | File on disk starts with `SNAP` (not `FF D8`); gallery image loads in UI | ☑ **2026-09-13** |
| **ENC-T2** | Open existing **plain** JPEG snapshot (pre-encryption) | Still displays in history gallery | ☑ **2026-09-13** |
| **ENC-T3** | Wrong/missing `EncryptionKeyBase64` with `EncryptAtRest: true` | API fails at startup | ☑ **2026-09-13** |
| **ENC-T4** | Raw disk open of encrypted file | Not a valid JPEG in viewer | ☑ **2026-09-13** |

**Exit:** ENC-T1–T4 → Phase 8 Blob CMK remains separate.

---

## Phase 8 carry-forward

- [ ] Azure Blob storage with platform or customer-managed keys
- [ ] Production key from **Azure Key Vault** (not appsettings)
- [ ] Optional: re-encrypt legacy plain files on migration

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-13 | Initial — dev disk encryption before Phase 7 Pi |
| 2026-09-13 | ENC-T1–T4 bench verified; capture quality `FrameCaptureMaxWidth`; history `SnapshotLightbox` |
