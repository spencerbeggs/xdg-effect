# SQLite State

When your application needs persistent structured data beyond simple key/value caching, `SqliteState` provides a managed SQLite database with migration tracking. Define migrations as Effect programs, and the service handles applying, tracking, and rolling back.

## When to Use

`SqliteState` is the right tool for:

- Sync history — when did we last sync each repo?
- User preferences with relations
- Structured data that outlives individual cache entries
- Anything you would use a local database for

**`SqliteState` vs `SqliteCache`:** Cache is for ephemeral, TTL-bounded data — values that can be recomputed or refetched. State is for persistent, schema-evolving data — structured records that must survive restarts and grow over time. If your data has an expiry date, use `SqliteCache`. If it needs a schema and migrations, use `SqliteState`.

## Setup

Install the optional peer dependencies:

```bash
pnpm add @effect/sql @effect/sql-sqlite-node
```

Create a `SqlClient` layer using `@effect/sql-sqlite-node`, then provide it to `SqliteState.Live`:

```typescript
import { SqliteClient } from "@effect/sql-sqlite-node";
import { SqliteState } from "xdg-effect";
import type { StateMigration } from "xdg-effect";

const migrations: ReadonlyArray<StateMigration> = [];

const dbLayer = SqliteClient.layer({ filename: "/home/user/.local/share/my-tool/state.db" });
const stateLayer = SqliteState.Live({ migrations });
```

For an XDG-compliant database location, use the `AppDirs` service to resolve the data directory at runtime:

```typescript
import { NodeFileSystem } from "@effect/platform-node";
import { Path } from "@effect/platform";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect, Layer } from "effect";
import { AppDirs, AppDirsConfig, SqliteState, XdgLive } from "xdg-effect";
import type { StateMigration } from "xdg-effect";

const migrations: ReadonlyArray<StateMigration> = [];

const dbLayer = Layer.unwrapEffect(
  Effect.gen(function* () {
    const appDirs = yield* AppDirs;
    const path = yield* Path.Path;
    const dataDir = yield* appDirs.data;
    return SqliteClient.layer({ filename: path.join(dataDir, "state.db") });
  }),
);

const appLayer = XdgLive(new AppDirsConfig({ namespace: "my-tool" }));
const stateLayer = SqliteState.Live({ migrations }).pipe(
  Layer.provide(dbLayer),
  Layer.provide(appLayer),
  Layer.provide(NodeFileSystem.layer),
);
```

`appDirs.data` resolves to the XDG data directory (e.g., `~/.local/share/my-tool`). The database file lives there alongside other persistent application data.

> **Auto-migration on construction:** `SqliteState.Live` automatically applies all pending migrations when the layer is constructed — before your application code runs. This means calling `state.migrate` after the layer is built is a no-op (all migrations are already applied). If you need to control migration timing, use the `SqlClient` directly instead of `SqliteState.Live`.

## Migrations

Migrations are plain objects with an `id`, a `name`, and an `up` function. The `down` function is optional.

```typescript
interface StateMigration {
  readonly id: number;
  readonly name: string;
  readonly up: (client: SqlClient.SqlClient) => Effect<void, unknown>;
  readonly down?: (client: SqlClient.SqlClient) => Effect<void, unknown>;
}
```

- `id` is numeric and sequential — migrations run in ascending `id` order
- `up` and `down` receive a `SqlClient` for running SQL against the database
- Applied migrations are tracked in a `_xdg_migrations` table created automatically
- `down` is optional; without it, rollback skips that migration

Define your migrations as a `ReadonlyArray<StateMigration>` and pass them to `SqliteState.Live`:

```typescript
import type { SqlClient } from "@effect/sql";
import { Effect } from "effect";
import type { StateMigration } from "xdg-effect";

const migrations: ReadonlyArray<StateMigration> = [
  {
    id: 1,
    name: "create-sync-history",
    up: (client: SqlClient.SqlClient) =>
      client.execute(`
        CREATE TABLE sync_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          repo TEXT NOT NULL,
          synced_at TEXT NOT NULL DEFAULT (datetime('now')),
          status TEXT NOT NULL DEFAULT 'success',
          details TEXT
        )
      `),
    down: (client: SqlClient.SqlClient) =>
      client.execute(`DROP TABLE IF EXISTS sync_history`),
  },
  {
    id: 2,
    name: "add-duration-column",
    up: (client: SqlClient.SqlClient) =>
      client.execute(
        `ALTER TABLE sync_history ADD COLUMN duration_ms INTEGER`,
      ),
    down: (client: SqlClient.SqlClient) =>
      client.execute(
        `ALTER TABLE sync_history DROP COLUMN duration_ms`,
      ),
  },
];
```

## SqliteState Service

Access the service by yielding the `SqliteState` tag inside `Effect.gen`:

```typescript
interface SqliteStateService {
  readonly client: SqlClient.SqlClient;
  readonly migrate: Effect<MigrationResult, StateError>;
  readonly rollback: (toId: number) => Effect<MigrationResult, StateError>;
  readonly status: Effect<ReadonlyArray<MigrationStatus>, StateError>;
}
```

- `migrate` — runs all pending migrations forward in `id` order
- `rollback(toId)` — rolls back to a specific migration by running `down` functions in reverse order for all migrations with `id > toId`
- `status` — returns all known migrations and reports which are applied and which are pending
- `client` — the raw `SqlClient` for running custom queries after migrations have been applied

### MigrationResult

```typescript
interface MigrationResult {
  readonly applied: ReadonlyArray<{ readonly id: number; readonly name: string }>;
  readonly rolledBack: ReadonlyArray<{ readonly id: number; readonly name: string }>;
}
```

`applied` lists migrations that were run forward. `rolledBack` lists migrations that were reversed. For a plain `migrate` call, `rolledBack` will be empty.

### MigrationStatus

Each entry in the `status` array has these fields:

| Field | Type | Description |
| ----- | ---- | ----------- |
| `id` | `number` | Migration id |
| `name` | `string` | Migration name |
| `appliedAt` | `Option<DateTime>` | When applied, or `Option.none()` if pending |

`appliedAt` uses `Option<DateTime>`. Check `Option.isSome(m.appliedAt)` to determine whether a migration has been applied.

## Runnable Example

The following program creates a sync history table, inserts a row, checks migration status, and then rolls back:

```typescript
import type { SqlClient } from "@effect/sql";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect, Option } from "effect";
import {
  SqliteState,
  type StateMigration,
} from "xdg-effect";

const migrations: ReadonlyArray<StateMigration> = [
  {
    id: 1,
    name: "create-sync-history",
    up: (client: SqlClient.SqlClient) =>
      client.execute(`
        CREATE TABLE sync_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          repo TEXT NOT NULL,
          synced_at TEXT NOT NULL DEFAULT (datetime('now')),
          status TEXT NOT NULL DEFAULT 'success'
        )
      `),
    down: (client: SqlClient.SqlClient) =>
      client.execute(`DROP TABLE IF EXISTS sync_history`),
  },
  {
    id: 2,
    name: "add-duration-column",
    up: (client: SqlClient.SqlClient) =>
      client.execute(
        `ALTER TABLE sync_history ADD COLUMN duration_ms INTEGER`,
      ),
  },
];

const program = Effect.gen(function* () {
  const state = yield* SqliteState;

  // Check migration status
  const status = yield* state.status;
  for (const m of status) {
    const applied = Option.isSome(m.appliedAt) ? "applied" : "pending";
    console.log(`Migration ${m.id} (${m.name}): ${applied}`);
  }

  // Run pending migrations
  const result = yield* state.migrate;
  console.log(`Applied ${result.applied.length} migrations`);

  // Use the raw client for custom queries
  yield* state.client.execute(
    `INSERT INTO sync_history (repo, status) VALUES ('xdg-effect', 'success')`,
  );

  const rows = yield* state.client.execute(`SELECT * FROM sync_history`);
  console.log("Sync history:", rows);

  // Roll back to migration 1
  const rollbackResult = yield* state.rollback(1);
  console.log(`Rolled back ${rollbackResult.rolledBack.length} migrations`);
});

const dbLayer = SqliteClient.layer({ filename: ":memory:" });
const stateLayer = SqliteState.Live({ migrations });

Effect.runPromise(
  program.pipe(
    Effect.provide(stateLayer),
    Effect.provide(dbLayer),
  ),
);
```

The example uses `:memory:` for simplicity. In production, use `AppDirs.data` to get the XDG data directory and persist the database there.

## Using with XdgFullLive

When using `XdgFullLive`, both `SqliteCache` and `SqliteState` share the same `SqlClient` instance — meaning they use the same database file. If you need separate databases (e.g., cache in `$XDG_CACHE_HOME` and state in `$XDG_DATA_HOME`), compose `SqliteCache.Live()` and `SqliteState.Live()` separately with different `SqlClient` layers instead of using `XdgFullLive`.

---

[Previous: SQLite Cache](./04-sqlite-cache.md) | [Next: Building a CLI](./06-building-a-cli.md)
