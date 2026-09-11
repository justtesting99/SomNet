# Video — Phase 5 Edge agent (session lifecycle + gateway)

**Status:** **Blocked** — complete [Phase 4](./17-Video-Phase-4-Action-Snapshots-Checklist.md) first

**Goal:** Small **edge agent** on PC: `session_started` / `session_ended` from API; enable/disable go2rtc pull; validate stream tokens; trigger snapshot capture on ack (replace UI callback).

See [13 §10](./13-Video-And-Camera-Architecture.md#10-session-scoped-streaming-recommended-security-model) · `SomNet.Edge/`

---

## Exit criteria (draft)

- Session start enables streams; end disables and revokes gateway access
- Snapshots on ack without UI dependency
- → [Phase 6](./19-Video-Phase-6-Tunnel-Checklist.md)

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial stub |
