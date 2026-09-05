# Database Schema

SomNet uses **Entity Framework Core** with **SQL Server LocalDB**. The database file is attached at startup from the solution `data/` folder.

**Connection string pattern:**

```
Server=(localdb)\MSSQLLocalDB;
AttachDbFilename={solution}/data/SomNet.mdf;
Database=SomNet;
Trusted_Connection=True;
TrustServerCertificate=True
```

**Context class:** `SomNet.API/Data/SomNetDbContext.cs`

Migrations run automatically on API startup via `db.Database.Migrate()`. Empty databases are seeded by `SomNetDbSeeder.SeedIfEmpty()`.

---

## Entity Relationship Overview

```
Users
  (standalone — authentication)

DomSubAssignments ──┐
DomSubExclusions  ──┼──► DomTarget + SubName (string keys)
DomSubSettings    ──┘
SubDeviceRegistrations

Sessions ──────────► DomTarget + SubTarget + StartedAt
Notifications ─────► DomTarget + SubTarget + SentAt
```

All Dom/Sub scoping uses **string names**, not numeric IDs. The authenticated Dom's display name (or username) is the `DomTarget` value throughout.

---

## Tables

### Users

Authentication accounts.

| Column | Type | Notes |
|--------|------|-------|
| Username | string (PK) | 3–32 chars |
| PasswordHash | string | ASP.NET PasswordHasher output |
| DisplayName | string | Shown in UI as Dom name |

### DomSubSettings

Per Dom+Sub pairing configuration stored as JSON.

| Column | Type | Notes |
|--------|------|-------|
| DomTarget | string (PK part) | |
| SubName | string (PK part) | Renamed from SubTarget in migration |
| SettingsJson | string (max 8000) | Serialized `PairingSettingsDto` |

**Serializer:** `PairingSettingsSerializer.cs` handles legacy ms→percent migration on read.

### DomSubAssignments

Explicit Dom→Sub assignments created via the Sub selection dialog.

| Column | Type | Notes |
|--------|------|-------|
| DomTarget | string (PK part) | |
| SubName | string (PK part) | |

### DomSubExclusions

Soft-hide list — subs removed by the operator no longer appear in GET `/api/subs` but historical records remain.

| Column | Type | Notes |
|--------|------|-------|
| DomTarget | string (PK part) | |
| SubName | string (PK part) | |

### Sessions

Completed and in-progress session history.

| Column | Type | Notes |
|--------|------|-------|
| Id | string (PK, max 32) | Format: `sess-001`, `sess-002`, … |
| StartedAt | DateTimeOffset | |
| DomTarget | string | |
| SubTarget | string | Sub participant name |
| Mode | string | `Manual` or `Automatic` |
| Summary | string | Human-readable session description |

**Index:** `(DomTarget, SubTarget, StartedAt)`

### Notifications

Scheduled/upcoming session notifications.

| Column | Type | Notes |
|--------|------|-------|
| Id | string (PK) | |
| SentAt | DateTimeOffset | When notification was created |
| DomTarget | string | |
| SubTarget | string | |
| Subject | string | Default: "Upcoming Session" |
| SessionDateTime | DateTimeOffset | Target session date/time |

**Index:** `(DomTarget, SubTarget, SentAt)`

### SubDeviceRegistrations

Hardware device pairing for a Dom+Sub pair.

| Column | Type | Notes |
|--------|------|-------|
| DomTarget | string (PK part) | |
| SubName | string (PK part) | |
| DeviceId | string | ESP32 identifier |
| AccessToken | string | Current device JWT (stored server-side) |
| TokenJti | string | JWT ID for revocation tracking |
| PairedAt | DateTimeOffset | |
| TokenExpiresAt | DateTimeOffset | |
| LastConnectedAt | DateTimeOffset? | Updated on hub connect |
| IsRevoked | bool | True after DELETE /api/devices/pair |

**Index:** `DeviceId`

---

## Migration History

| Migration | Date (timestamp) | Changes |
|-----------|------------------|---------|
| `InitialCreate` | 20260904220241 | `Sessions`, `Notifications` (SubTarget as int enum), `UserOptions` |
| `AddUsers` | 20260904221800 | `Users` table |
| `AddDomSubSettings` | 20260904231342 | Drop `UserOptions`; add `DomSubSettings` |
| `AddDomSubAssignmentsAndStringSubs` | 20260904232452 | Convert SubTarget int→string (`Slv66`/`Slv67`/`Slv68`); add `DomSubAssignments` |
| `AddDomSubExclusions` | 20260904233329 | `DomSubExclusions` table |
| `AddSubDeviceRegistrations` | 20260905003715 | Hardware pairing table |

### SubTarget Int → String Conversion

The `AddDomSubAssignmentsAndStringSubs` migration converted legacy integer enum values:

| Old int | New string |
|---------|------------|
| 0 | Slv66 |
| 1 | Slv67 |
| 2 | Slv68 |

---

## Seed Data

When the database has no users, `SomNetDbSeeder` creates:

- **Demo user:** username `demo`, password `demo`, display name for Dom operations
- **Sample sessions and notifications** (when no sessions exist), including cross-Dom isolation examples

Seed data demonstrates timeline filtering and Dom-scoped history queries.

---

## Data Access Patterns

All database operations flow through `ISomNetDataStore` (`SomNetDataStore.cs`):

| Operation | Method area |
|-----------|-------------|
| Auth | User lookup, create |
| Sessions | Start, update, end, list |
| History | Timeline merge, session queries |
| Subs | List composition, add, remove |
| Settings | Get/put pairing JSON |
| Devices | Registration CRUD, status |
| Notifications | Create, list for timeline |

Controllers remain thin — validation and HTTP concerns only.

---

## Design-Time Migrations

EF Core design-time factory: `SomNetDbContextFactory.cs`

Run migrations from the `SomNet.API` directory:

```powershell
dotnet ef migrations add MigrationName
dotnet ef database update
```

The factory resolves the database path relative to `../data/SomNet.mdf`.

**Note:** In normal development, migrations apply automatically on startup — manual `dotnet ef database update` is rarely needed.

---

## Future Considerations

- **Azure SQL** for production (connection string swap)
- **Token storage** — device tokens currently stored in DB; consider hashing for production
- **SettingsJson size** — 8000 char limit may need expansion for richer automatic configs
- **Session archival** — no purge/retention policy yet
