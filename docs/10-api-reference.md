# API Reference

Complete reference for all xdg-effect exports, organized by category. Each entry links to the guide that covers it in depth.

## Services

| Service | Tag | Guide |
| ------- | --- | ----- |
| `XdgResolver` | `"xdg-effect/XdgResolver"` | [Resolving XDG Paths](./02-resolving-xdg-paths.md) |
| `AppDirs` | `"xdg-effect/AppDirs"` | [Resolving XDG Paths](./02-resolving-xdg-paths.md) |
| `ConfigFileService<A>` | via `makeConfigFileTag(id)` | [Config Files](./03-config-files.md) |
| `JsonSchemaExporter` | `"xdg-effect/JsonSchemaExporter"` | [JSON Schema Generation](./04-json-schema-generation.md) |
| `SqliteCache` | `"xdg-effect/SqliteCache"` | [SQLite Cache](./05-sqlite-cache.md) |
| `SqliteState` | `"xdg-effect/SqliteState"` | [SQLite State](./06-sqlite-state.md) |

```typescript
// XdgResolverService
interface XdgResolverService {
  readonly configHome: Effect<Option<string>>;
  readonly dataHome: Effect<Option<string>>;
  readonly cacheHome: Effect<Option<string>>;
  readonly stateHome: Effect<Option<string>>;
  readonly runtimeDir: Effect<Option<string>>;
  readonly home: Effect<string, XdgError>;
  readonly resolveAll: Effect<XdgPaths, XdgError>;
}

// AppDirsService
interface AppDirsService {
  readonly config: Effect<string, AppDirsError>;
  readonly data: Effect<string, AppDirsError>;
  readonly cache: Effect<string, AppDirsError>;
  readonly state: Effect<string, AppDirsError>;
  readonly runtime: Effect<Option<string>, AppDirsError>;
  readonly resolveAll: Effect<ResolvedAppDirs, AppDirsError>;
  readonly ensure: Effect<ResolvedAppDirs, AppDirsError>;
}

// ConfigFileService<A>
interface ConfigFileService<A> {
  readonly load: Effect<A, ConfigError>;
  readonly loadFrom: (path: string) => Effect<A, ConfigError>;
  readonly discover: Effect<ReadonlyArray<ConfigSource<A>>, ConfigError>;
  readonly write: (value: A, path: string) => Effect<void, ConfigError>;
}

// JsonSchemaExporterService
interface JsonSchemaExporterService {
  readonly generate: (entry: SchemaEntry) => Effect<JsonSchemaOutput, JsonSchemaError>;
  readonly generateMany: (entries: ReadonlyArray<SchemaEntry>) => Effect<ReadonlyArray<JsonSchemaOutput>, JsonSchemaError>;
  readonly write: (output: JsonSchemaOutput, path: string) => Effect<WriteResult, JsonSchemaError>;
  readonly writeMany: (outputs: ReadonlyArray<{ output: JsonSchemaOutput; path: string }>) => Effect<ReadonlyArray<WriteResult>, JsonSchemaError>;
}

// SqliteCacheService
interface SqliteCacheService {
  readonly get: (key: string) => Effect<Option<CacheEntry>, CacheError>;
  readonly set: (params: {
    readonly key: string;
    readonly value: Uint8Array;
    readonly contentType?: string;
    readonly tags?: ReadonlyArray<string>;
    readonly ttl?: Duration;
  }) => Effect<void, CacheError>;
  readonly invalidate: (key: string) => Effect<void, CacheError>;
  readonly invalidateByTag: (tag: string) => Effect<void, CacheError>;
  readonly invalidateAll: Effect<void, CacheError>;
  readonly prune: Effect<PruneResult, CacheError>;
  readonly has: (key: string) => Effect<boolean, CacheError>;
  readonly entries: Effect<ReadonlyArray<CacheEntryMeta>, CacheError>;
  readonly events: PubSub.PubSub<CacheEvent>;
}

// SqliteStateService
interface SqliteStateService {
  readonly client: SqlClient.SqlClient;
  readonly migrate: Effect<MigrationResult, StateError>;
  readonly rollback: (toId: number) => Effect<MigrationResult, StateError>;
  readonly status: Effect<ReadonlyArray<MigrationStatus>, StateError>;
}
```

## Layers

| Layer | Provides | Requires | Guide |
| ----- | -------- | -------- | ----- |
| `XdgResolverLive` | `XdgResolver` | (none) | [Resolving XDG Paths](./02-resolving-xdg-paths.md) |
| `AppDirsLive(config)` | `AppDirs` | `XdgResolver`, `FileSystem` | [Resolving XDG Paths](./02-resolving-xdg-paths.md) |
| `XdgLive(config)` | `XdgResolver`, `AppDirs` | `FileSystem` | [Resolving XDG Paths](./02-resolving-xdg-paths.md) |
| `makeConfigFileLive(options)` | `ConfigFileService<A>` | `FileSystem` | [Config Files](./03-config-files.md) |
| `XdgConfigLive(options)` | `XdgResolver`, `AppDirs`, `ConfigFileService<A>` | `FileSystem` | [Config Files](./03-config-files.md) |
| `JsonSchemaExporterLive` | `JsonSchemaExporter` | `FileSystem` | [JSON Schema Generation](./04-json-schema-generation.md) |
| `makeSqliteCacheLive()` | `SqliteCache` | `SqlClient` | [SQLite Cache](./05-sqlite-cache.md) |
| `makeSqliteStateLive(options)` | `SqliteState` | `SqlClient` | [SQLite State](./06-sqlite-state.md) |
| `XdgFullLive(options)` | `XdgResolver`, `AppDirs`, `ConfigFileService<A>`, `SqliteCache`, `SqliteState` | `FileSystem`, `SqlClient` | [Getting Started](./01-getting-started.md) |

## Codecs

| Codec | Format | Extensions | Guide |
| ----- | ------ | ---------- | ----- |
| `JsonCodec` | JSON | `.json` | [Config Files](./03-config-files.md) |
| `TomlCodec` | TOML | `.toml` | [Config Files](./03-config-files.md) |

```typescript
interface ConfigCodec {
  readonly name: string;
  readonly extensions: ReadonlyArray<string>;
  readonly parse: (raw: string) => Effect<unknown, CodecError>;
  readonly stringify: (value: unknown) => Effect<string, CodecError>;
}
```

## Resolvers

| Resolver | Parameters | Requires | Guide |
| -------- | ---------- | -------- | ----- |
| `ExplicitPath(path)` | `path: string` | `FileSystem` | [Config Files](./03-config-files.md) |
| `StaticDir(options)` | `dir`, `filename` | `FileSystem` | [Config Files](./03-config-files.md) |
| `UpwardWalk(options)` | `filename`, `cwd?`, `stopAt?` | `FileSystem` | [Config Files](./03-config-files.md) |
| `XdgConfig(options)` | `filename` | `FileSystem`, `AppDirs` | [Config Files](./03-config-files.md) |
| `WorkspaceRoot(options)` | `filename`, `subpath?`, `cwd?` | `FileSystem` | [Config Files](./03-config-files.md) |

```typescript
interface ConfigResolver<R = never> {
  readonly name: string;
  readonly resolve: Effect<Option<string>, never, R>;
}
```

## Strategies

| Strategy | Behavior | Guide |
| -------- | -------- | ----- |
| `FirstMatch` | Returns highest-priority source | [Config Files](./03-config-files.md) |
| `LayeredMerge` | Deep-merges all sources | [Config Files](./03-config-files.md) |

```typescript
interface ConfigSource<A> {
  readonly path: string;
  readonly tier: string;
  readonly value: A;
}

interface ConfigWalkStrategy<A> {
  readonly resolve: (sources: ReadonlyArray<ConfigSource<A>>) => Effect<A, ConfigError>;
}
```

## Schemas

| Schema | Fields | Guide |
| ------ | ------ | ----- |
| `XdgPaths` | `home`, `configHome?`, `dataHome?`, `cacheHome?`, `stateHome?`, `runtimeDir?` | [Resolving XDG Paths](./02-resolving-xdg-paths.md) |
| `AppDirsConfig` | `namespace`, `fallbackDir?`, `dirs?` | [Resolving XDG Paths](./02-resolving-xdg-paths.md) |
| `ResolvedAppDirs` | `config`, `data`, `cache`, `state`, `runtime?` | [Resolving XDG Paths](./02-resolving-xdg-paths.md) |
| `CacheEntry` | `key`, `value`, `contentType`, `tags`, `created`, `expiresAt?`, `sizeBytes` | [SQLite Cache](./05-sqlite-cache.md) |
| `CacheEvent` | `timestamp`, `event` (Hit\|Miss\|Set\|...) | [SQLite Cache](./05-sqlite-cache.md) |
| `CacheEventPayload` | Hit\|Miss\|Set\|Invalidated\|... (tagged union) | [SQLite Cache](./05-sqlite-cache.md) |
| `MigrationStatus` | `id`, `name`, `appliedAt?` | [SQLite State](./06-sqlite-state.md) |
| `WriteResult` | `Written`\|`Unchanged` with `path` | [JSON Schema Generation](./04-json-schema-generation.md) |

## Errors

| Error | Tag | Fields | Guide |
| ----- | --- | ------ | ----- |
| `XdgError` | `"XdgError"` | `message` | [Error Handling](./09-error-handling.md) |
| `AppDirsError` | `"AppDirsError"` | `directory`, `reason` | [Error Handling](./09-error-handling.md) |
| `ConfigError` | `"ConfigError"` | `operation`, `path?`, `reason` | [Error Handling](./09-error-handling.md) |
| `CodecError` | `"CodecError"` | `codec`, `operation` (`"parse"` \| `"stringify"`), `reason` | [Error Handling](./09-error-handling.md) |
| `JsonSchemaError` | `"JsonSchemaError"` | `operation`, `name`, `reason` | [Error Handling](./09-error-handling.md) |
| `CacheError` | `"CacheError"` | `operation`, `key?`, `reason` | [Error Handling](./09-error-handling.md) |
| `StateError` | `"StateError"` | `operation`, `reason` | [Error Handling](./09-error-handling.md) |

```typescript
type XdgEffectError = XdgError | AppDirsError | ConfigError | CodecError | JsonSchemaError | CacheError | StateError;
```

---

[Previous: Error Handling](./09-error-handling.md)
