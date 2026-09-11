# Video — Phase 4 Action snapshots (local storage)

**Status:** **Blocked** — complete [Phase 3](./16-Video-Phase-3-Session-Tokens-Checklist.md) first

**Goal:** On **device command ack**, capture front + rear stills; store on **local disk** or **Azurite**; attach URLs/metadata to session event (API + DB).

**Out of scope:** Azure Blob production; edge agent auto-trigger (Phase 5) — v1 may use UI callback after ack.

See [13 §9](./13-Video-And-Camera-Architecture.md#9-snapshot-timing-and-session-linkage).

---

## Smoke tests (draft)

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **V4-T1** | Manual stroke → ack | Front + rear JPEG saved; URLs on event | ☐ |
| **V4-T2** | View session history | Stills visible for action | ☐ |
| **V4-T3** | Rear settle delay | Rear still ≥1 s after ack (if enabled) | ☐ |

**Exit:** V4-T1–T3 → [Phase 5](./18-Video-Phase-5-Edge-Agent-Checklist.md).

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial stub |
