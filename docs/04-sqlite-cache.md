# SQLite Cache

xdg-effect includes a SQLite-backed key/value cache with TTL expiry, tag-based invalidation, and real-time observability through PubSub events. Use it for caching API responses, rate-limit tracking, or any computed values that are expensive to recompute.

## Setup

Install the optional peer dependencies:

```bash
pnpm add @effect/sql @effect/sql-sqlite-node
```

Create a `SqlClient` layer using `@effect/sql-sqlite-node`, then provide it to `SqliteCache.Live`:

```typescript
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Layer } from "effect";
import { SqliteCache } from "xdg-effect";

const dbLayer = SqliteClient.layer({ filename: "/home/user/.cache/my-tool/cache.db" });
const cacheLayer = SqliteCache.Live().pipe(Layer.provide(dbLayer));
```

For an XDG-compliant database location, use the `AppDirs` service to resolve the cache directory at runtime:

```typescript
import { NodeFileSystem } from "@effect/platform-node";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Path } from "@effect/platform";
import { Effect, Layer } from "effect";
import { AppDirs, AppDirsConfig, SqliteCache, XdgLive } from "xdg-effect";

const dbLayer = Layer.unwrapEffect(
  Effect.gen(function* () {
    const appDirs = yield* AppDirs;
    const path = yield* Path.Path;
    const cacheDir = yield* appDirs.cache;
    return SqliteClient.layer({ filename: path.join(cacheDir, "cache.db") });
  }),
);

const appLayer = XdgLive(new AppDirsConfig({ namespace: "my-tool" }));
const cacheLayer = SqliteCache.Live().pipe(
  Layer.provide(dbLayer),
  Layer.provide(appLayer),
  Layer.provide(NodeFileSystem.layer),
);
```

`appDirs.cache` resolves to the XDG cache directory (e.g., `~/.cache/my-tool`). The database file lives alongside other non-essential cached data for your application.

## Basic Usage

Use `cache.set` to store a value and `cache.get` to retrieve it:

```typescript
import { Effect, Option } from "effect";
import { SqliteCache } from "xdg-effect";

const program = Effect.gen(function* () {
  const cache = yield* SqliteCache;

  // Encode data as Uint8Array
  const encoder = new TextEncoder();
  yield* cache.set({
    key: "user:42",
    value: encoder.encode(JSON.stringify({ name: "Alice", role: "admin" })),
    contentType: "application/json",
  });

  // Retrieve and decode
  const entry = yield* cache.get("user:42");
  if (Option.isSome(entry)) {
    const decoder = new TextDecoder();
    // entry is Option<CacheEntry>, so entry.value is the CacheEntry
    // and entry.value.value is the Uint8Array payload
    const user = JSON.parse(decoder.decode(entry.value.value));
    console.log("User:", user);
  }

  // Check existence without reading the value
  const exists = yield* cache.has("user:42");
  console.log("Exists:", exists);

  // Remove a specific entry
  yield* cache.invalidate("user:42");

  // Remove all entries
  yield* cache.invalidateAll();
});
```

`cache.get` returns `Option<CacheEntry>`. It checks expiry on read — if the entry has expired, it is deleted and `Option.none()` is returned. `cache.has` applies the same expiry check.

All values are stored as `Uint8Array`. Use `TextEncoder` for strings and combine `JSON.stringify` with `TextEncoder` for objects. Reverse the process on retrieval with `TextDecoder` and `JSON.parse`.

## Concurrency

`SqliteCache` delegates all operations to the underlying `SqlClient` from `@effect/sql`. Concurrent fiber access is safe — `@effect/sql-sqlite-node` serializes writes internally. The database uses SQLite's default journal mode. For high-concurrency scenarios, consider configuring WAL mode at the `SqlClient` layer level.

## TTL and Expiry

Pass a `ttl` (time-to-live) to `cache.set` using Effect's `Duration` module:

```typescript
import { Duration, Effect } from "effect";
import { SqliteCache } from "xdg-effect";

const program = Effect.gen(function* () {
  const cache = yield* SqliteCache;
  const encoder = new TextEncoder();

  // Expires in 5 minutes
  yield* cache.set({
    key: "rate-limit:user:42",
    value: encoder.encode("10"),
    ttl: Duration.minutes(5),
  });

  // Expires in 1 hour
  yield* cache.set({
    key: "github:repos:spencerbeggs",
    value: encoder.encode(JSON.stringify([])),
    contentType: "application/json",
    ttl: Duration.hours(1),
  });
});
```

Expiry is checked lazily on `get` and `has`. Expired entries are deleted on access. To bulk-remove all expired entries proactively, call `cache.prune()`:

```typescript
const result = yield* cache.prune();
console.log(`Pruned ${result.count} entries:`, result.keys);
// Pruned <n> entries: [ "rate-limit:user:42", ... ]
```

`prune` returns a `CacheRemovalResult` with `count` (how many entries were removed) and `keys` (the keys that were removed). Use `keys` to clean up anything those entries were tracking — on-disk artifacts, downstream caches — without enumerating the cache separately. Call `prune` on a schedule to keep the database compact.

To roll back the prune if that cleanup fails, pass an `onRemoved` callback. It runs inside the same transaction as the delete, before commit. If it fails, the delete is undone and no `Pruned` event is emitted:

```typescript
const result = yield* cache.prune((removed) =>
  // Runs inside the delete transaction; throwing here rolls the delete back
  Effect.forEach(removed.keys, (key) => deleteOnDiskArtifact(key), { discard: true }),
);
console.log(`Pruned and cleaned up ${result.count} entries`);
// Pruned and cleaned up <n> entries
```

If you don't need rollback, run the cleanup after the delete with `Effect.tap` instead. This still fails the operation when cleanup fails, but the delete stays committed:

```typescript
const result = yield* cache.prune().pipe(
  Effect.tap((removed) =>
    Effect.forEach(removed.keys, (key) => deleteOnDiskArtifact(key), { discard: true }),
  ),
);
```

## Tag-Based Invalidation

Tag entries at write time and invalidate all entries sharing a tag in one call:

```typescript
import { Duration, Effect } from "effect";
import { SqliteCache } from "xdg-effect";

const program = Effect.gen(function* () {
  const cache = yield* SqliteCache;
  const encoder = new TextEncoder();

  // Tag entries with logical groups
  yield* cache.set({
    key: "github:repos:spencerbeggs",
    value: encoder.encode("[]"),
    tags: ["github-api", "repos"],
    ttl: Duration.hours(1),
  });

  yield* cache.set({
    key: "github:user:spencerbeggs",
    value: encoder.encode("{}"),
    tags: ["github-api", "users"],
    ttl: Duration.hours(1),
  });

  // Invalidate all github-api entries when the auth token changes
  const removed = yield* cache.invalidateByTag("github-api");
  console.log(`Removed ${removed.count} entries:`, removed.keys);
  // Removed <n> entries: [ "github:repos:spencerbeggs", "github:user:spencerbeggs" ]
});
```

`invalidateByTag` removes all entries whose `tags` array includes the given tag. This is useful when a shared dependency (an auth token, a database row, a remote resource) changes and all derived cache entries must be flushed together. It returns a `CacheRemovalResult` with the `count` and `keys` removed.

Like `prune` and `invalidateAll`, `invalidateByTag` accepts an optional `onRemoved` callback that runs inside the delete transaction before commit. A failing callback rolls back the delete and suppresses the `InvalidatedByTag` event. `invalidate` accepts the same callback, taking no arguments since it removes a single known key.

## PubSub Events

> **Effect concept: PubSub** — A PubSub is a concurrent, typed publish/subscribe channel. Producers publish events, and any number of subscribers receive them. See the [Effect docs on PubSub](https://effect.website/docs/guides/concurrency/pubsub) for more.

Every cache operation emits a typed event on `cache.events`, which is a `PubSub.PubSub<CacheEvent>`. Subscribe to it for logging, metrics, or debugging:

```typescript
import { Effect, PubSub, Queue } from "effect";
import { SqliteCache } from "xdg-effect";

const program = Effect.gen(function* () {
  const cache = yield* SqliteCache;

  // Subscribe to all cache events — requires Effect.scoped
  const subscriber = yield* PubSub.subscribe(cache.events);

  yield* cache.set({ key: "x", value: new Uint8Array([1]) });

  const event = yield* Queue.take(subscriber);
  console.log(event.event._tag); // "Set"
  console.log(event.timestamp);  // DateTime
});

// PubSub.subscribe acquires a scoped resource
Effect.runPromise(program.pipe(Effect.scoped, Effect.provide(cacheLayer)));
```

Calling `PubSub.subscribe` acquires a scoped resource — the subscription. `Effect.scoped` defines the lifetime of that subscription: when the scope closes, the subscription is automatically cleaned up. For short-lived programs, wrapping the entire program in `Effect.scoped` is sufficient. For long-running services, you may want to manage the scope explicitly using `Effect.acquireRelease` or by structuring your layer to hold the subscription for its lifetime.

Each `CacheEvent` has a `timestamp` (`DateTime`) and an `event` payload from the following tagged union:

| Tag | Fields | When emitted |
| --- | ------ | ------------ |
| `Hit` | `key` | `get` found a valid entry |
| `Miss` | `key` | `get` found no entry |
| `Set` | `key`, `sizeBytes`, `tags` | `set` wrote an entry |
| `Invalidated` | `key` | `invalidate` removed an entry |
| `InvalidatedByTag` | `tag`, `count`, `keys` | `invalidateByTag` removed entries |
| `InvalidatedAll` | `count`, `keys` | `invalidateAll` cleared the cache |
| `Pruned` | `count`, `keys` | `prune` removed expired entries |
| `Expired` | `key` | `get` or `has` found an expired entry |

Pattern-match on `event._tag` to handle specific event types:

```typescript
import { Effect, PubSub, Queue } from "effect";
import { SqliteCache } from "xdg-effect";

const program = Effect.gen(function* () {
  const cache = yield* SqliteCache;
  const subscriber = yield* PubSub.subscribe(cache.events);

  // Process events in the background
  yield* Effect.fork(
    Effect.forever(
      Effect.gen(function* () {
        const ev = yield* Queue.take(subscriber);
        switch (ev.event._tag) {
          case "Hit":
            console.log(`[cache] hit: ${ev.event.key}`);
            break;
          case "Miss":
            console.log(`[cache] miss: ${ev.event.key}`);
            break;
          case "Set":
            console.log(`[cache] set: ${ev.event.key} (${ev.event.sizeBytes} bytes)`);
            break;
          case "Expired":
            console.log(`[cache] expired: ${ev.event.key}`);
            break;
        }
      }),
    ),
  );
});
```

## API Reference

### SqliteCacheService

```typescript
interface SqliteCacheService {
  readonly get: (key: string) => Effect<Option<CacheEntry>, CacheError>;
  readonly set: (params: {
    readonly key: string;
    readonly value: Uint8Array;
    readonly contentType?: string;
    readonly tags?: ReadonlyArray<string>;
    readonly ttl?: Duration;
  }) => Effect<void, CacheError>;
  readonly invalidate: <E = never, R = never>(
    key: string,
    onRemoved?: () => Effect<void, E, R>,
  ) => Effect<void, CacheError | E, R>;
  readonly invalidateByTag: <E = never, R = never>(
    tag: string,
    onRemoved?: (result: CacheRemovalResult) => Effect<void, E, R>,
  ) => Effect<CacheRemovalResult, CacheError | E, R>;
  readonly invalidateAll: <E = never, R = never>(
    onRemoved?: (result: CacheRemovalResult) => Effect<void, E, R>,
  ) => Effect<CacheRemovalResult, CacheError | E, R>;
  readonly prune: <E = never, R = never>(
    onRemoved?: (result: CacheRemovalResult) => Effect<void, E, R>,
  ) => Effect<CacheRemovalResult, CacheError | E, R>;
  readonly has: (key: string) => Effect<boolean, CacheError>;
  readonly entries: Effect<ReadonlyArray<CacheEntryMeta>, CacheError>;
  readonly events: PubSub.PubSub<CacheEvent>;
}
```

### CacheEntry

| Field | Type | Description |
| ----- | ---- | ----------- |
| `key` | `string` | Cache key |
| `value` | `Uint8Array` | Raw stored bytes |
| `contentType` | `string` | MIME type (default: `application/octet-stream`) |
| `tags` | `Array<string>` | Tags for group invalidation |
| `created` | `DateTime` | When the entry was written |
| `expiresAt` | `Option<DateTime>` | Expiry time, or `Option.none()` for no expiry |
| `sizeBytes` | `number` | Byte length of `value` |

### CacheEvent

```typescript
interface CacheEvent {
  readonly timestamp: DateTime;
  readonly event:
    | { _tag: "Hit"; key: string }
    | { _tag: "Miss"; key: string }
    | { _tag: "Set"; key: string; sizeBytes: number; tags: Array<string> }
    | { _tag: "Invalidated"; key: string }
    | { _tag: "InvalidatedByTag"; tag: string; count: number; keys: Array<string> }
    | { _tag: "InvalidatedAll"; count: number; keys: Array<string> }
    | { _tag: "Pruned"; count: number; keys: Array<string> }
    | { _tag: "Expired"; key: string };
}
```

### CacheEntryMeta

`entries` returns `ReadonlyArray<CacheEntryMeta>`. `CacheEntryMeta` provides metadata about cache entries without the binary value payload. Fields: `key`, `contentType`, `tags`, `created` (string), `expiresAt` (string | undefined), `sizeBytes`.

| Field | Type |
| ----- | ---- |
| `key` | `string` |
| `contentType` | `string` |
| `tags` | `ReadonlyArray<string>` |
| `created` | `string` |
| `expiresAt` | `string \| undefined` |
| `sizeBytes` | `number` |

### CacheRemovalResult

Returned by `prune`, `invalidateByTag` and `invalidateAll`. `PruneResult` is an alias of `CacheRemovalResult`, retained for backwards compatibility.

```typescript
interface CacheRemovalResult {
  readonly count: number;
  readonly keys: ReadonlyArray<string>;
}
```

## Example: GitHub API Response Cache

The following program builds a cache for GitHub API responses using an in-memory database. In production, replace `:memory:` with a path from `AppDirs.cache`.

```typescript
import { NodeFileSystem } from "@effect/platform-node";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Duration, Effect, Option, PubSub, Queue } from "effect";
import {
  AppDirs,
  AppDirsConfig,
  SqliteCache,
  XdgLive,
} from "xdg-effect";

const program = Effect.gen(function* () {
  const appDirs = yield* AppDirs;
  const cache = yield* SqliteCache;

  // Subscribe to cache events
  const subscriber = yield* PubSub.subscribe(cache.events);

  // Cache a response
  const encoder = new TextEncoder();
  yield* cache.set({
    key: "repos:spencerbeggs",
    value: encoder.encode(JSON.stringify([{ name: "xdg-effect" }])),
    contentType: "application/json",
    tags: ["github-api", "repos"],
    ttl: Duration.minutes(15),
  });

  // Read it back
  const entry = yield* cache.get("repos:spencerbeggs");
  if (Option.isSome(entry)) {
    const decoder = new TextDecoder();
    // entry is Option<CacheEntry>, so entry.value is the CacheEntry
    // and entry.value.value is the Uint8Array payload
    const data = JSON.parse(decoder.decode(entry.value.value));
    console.log("Cached repos:", data);
  }

  // Invalidate all github-api entries
  yield* cache.invalidateByTag("github-api");

  // Check events
  const event = yield* Queue.take(subscriber);
  console.log("Event:", event.event._tag);
});

const appLayer = XdgLive(new AppDirsConfig({ namespace: "my-tool" }));
const dbLayer = SqliteClient.layer({ filename: ":memory:" });

Effect.runPromise(
  program.pipe(
    Effect.scoped,
    Effect.provide(SqliteCache.Live()),
    Effect.provide(dbLayer),
    Effect.provide(appLayer),
    Effect.provide(NodeFileSystem.layer),
  ),
);
```

The example uses `:memory:` for simplicity. In production, use `AppDirs.cache` to get the XDG cache directory and create the database there.

---

[Previous: XDG Config Files](./03-xdg-config-files.md) | [Next: SQLite State](./05-sqlite-state.md)
