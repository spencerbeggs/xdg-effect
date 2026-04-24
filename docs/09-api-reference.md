# API Reference

xdg-effect exports XDG path resolution, XDG-specific config bridges, and SQLite services. Config file loading and JSON Schema tooling live in their own packages.

## Package Ecosystem

| Package | Docs |
| ------- | ---- |
| **xdg-effect** (this package) | You are here |
| **config-file-effect** | [GitHub](https://github.com/spencerbeggs/config-file-effect) |
| **json-schema-effect** | [GitHub](https://github.com/spencerbeggs/json-schema-effect) |

## Services

### XdgResolver

Reads XDG Base Directory environment variables through Effect's `Config` module.

```typescript
class XdgResolver extends Context.Tag("xdg-effect/XdgResolver") {
  static get Live(): Layer<XdgResolver>;
  static Test(options?): Layer<XdgResolver, never, Scope>;
}
```

- `home: Effect<string, XdgError>` — `HOME` (required, fails if unset)
- `configHome: Effect<Option<string>>` — `XDG_CONFIG_HOME`
- `dataHome: Effect<Option<string>>` — `XDG_DATA_HOME`
- `cacheHome: Effect<Option<string>>` — `XDG_CACHE_HOME`
- `stateHome: Effect<Option<string>>` — `XDG_STATE_HOME`
- `runtimeDir: Effect<Option<string>>` — `XDG_RUNTIME_DIR`
- `resolveAll: Effect<XdgPaths, XdgError>` — all paths in one call

### AppDirs

Resolves app-namespaced directory paths using a 4-level precedence model.

```typescript
class AppDirs extends Context.Tag("xdg-effect/AppDirs") {
  static Live(config: AppDirsConfig): Layer<AppDirs, never, XdgResolver | FileSystem>;
  static Test(options): Layer<XdgResolver | AppDirs, never, Scope>;
}
```

- `config`, `data`, `cache`, `state: Effect<string, AppDirsError>` — resolved paths
- `runtime: Effect<Option<string>, AppDirsError>` — optional runtime dir
- `ensureConfig`, `ensureData`, `ensureCache`, `ensureState: Effect<string, AppDirsError>` — resolve and create
- `ensure: Effect<ResolvedAppDirs, AppDirsError>` — resolve and create all
- `resolveAll: Effect<ResolvedAppDirs, AppDirsError>` — resolve without creating

### SqliteCache

Key/value cache with TTL, tags, and PubSub observability.

```typescript
class SqliteCache extends Context.Tag("xdg-effect/SqliteCache") {
  static Live(): Layer<SqliteCache, never, SqlClient>;
  static Test(): Layer<SqliteCache>;
}
```

See [SQLite Cache](./04-sqlite-cache.md) for the full interface.

### SqliteState

Managed SQLite database with user migrations and rollback.

```typescript
class SqliteState extends Context.Tag("xdg-effect/SqliteState") {
  static Live(options: { migrations }): Layer<SqliteState, never, SqlClient>;
  static Test(options: { migrations }): Layer<SqliteState>;
}
```

See [SQLite State](./05-sqlite-state.md) for the full interface.

## XDG Bridges (into config-file-effect)

### XdgConfigResolver

Resolver that looks for a file in the XDG config directory via `AppDirs`.

```typescript
function XdgConfigResolver(options: {
  readonly filename: string;
}): ConfigResolver<FileSystem | AppDirs>
```

### XdgSavePath

Resolves the default save path for a config file in the XDG config directory.

```typescript
function XdgSavePath(filename: string): Effect<string, ConfigError, AppDirs>
```

## Aggregate Layers

### XdgLive

```typescript
function XdgLive(config: AppDirsConfig): Layer<XdgResolver | AppDirs, never, FileSystem>
```

### XdgConfigLive

```typescript
function XdgConfigLive<A>(options: XdgConfigLiveOptions<A>): Layer<XdgResolver | AppDirs | ConfigFileService<A>, never, FileSystem>
```

`XdgConfigLiveOptions<A>` is `{ app: AppDirsConfig; config: ConfigFileOptions<A> }`.

### XdgConfigLive.toml() / .json()

```typescript
function XdgConfigLive.toml<A>(options: XdgConfigPresetOptions<A>): Layer<XdgResolver | AppDirs | ConfigFileService<A>, never, FileSystem>
function XdgConfigLive.json<A>(options: XdgConfigPresetOptions<A>): Layer<XdgResolver | AppDirs | ConfigFileService<A>, never, FileSystem>
```

Preset factories that encode the standard UpwardWalk + XdgConfigResolver resolver chain with FirstMatch strategy and XdgSavePath defaultPath. `XdgConfigPresetOptions<A>` is `{ namespace: string; filename: string; tag: ConfigFile.Tag<A>; schema: Schema<A>; validate?: ... }`.

### XdgConfigLive.multi()

```typescript
function XdgConfigLive.multi(options: XdgConfigMultiOptions): Layer<XdgResolver | AppDirs, never, FileSystem>
```

`XdgConfigMultiOptions` is `{ app: AppDirsConfig; configs: ReadonlyArray<ConfigFileOptions<any>> }`. Composes multiple config file services under a single XDG layer.

> **Type note:** The return type includes `ConfigFileService<any>` because TypeScript cannot preserve individual generic parameters across a heterogeneous array. This does not affect runtime behavior — consumers look up services by their specific `ConfigFile.Tag<A>` instances, which resolve to the correct typed service.

### XdgFullLive

```typescript
function XdgFullLive<A>(options: XdgFullLiveOptions<A>): Layer<XdgResolver | AppDirs | ConfigFileService<A> | SqliteCache | SqliteState, never, FileSystem | SqlClient>
```

`XdgFullLiveOptions<A>` is `{ app: AppDirsConfig; config: ConfigFileOptions<A>; migrations: ReadonlyArray<StateMigration> }`.

> **Multi-config with SQLite:** `XdgFullLive` does not have a `.multi()` variant. If you need multiple config files alongside SQLite, compose manually:
>
> ```typescript
> const layer = Layer.mergeAll(
>   XdgConfigLive.multi({ app, configs: [configSpec, credsSpec] }),
>   SqliteCache.Live(),
>   SqliteState.Live({ migrations }),
> );
> ```

### SqliteCache.XdgLive() / SqliteState.XdgLive()

```typescript
static XdgLive(options?: { filename?: string }): Layer<SqliteCache, never, AppDirs>
static XdgLive(options: { migrations: ReadonlyArray<StateMigration>; filename?: string }): Layer<SqliteState, never, AppDirs>
```

Convenience layers that resolve the SQLite file path from the XDG cache/data directory via `AppDirs`, removing the need to wire a separate `SqlClient` layer.

## Types

| Export | Description |
| ------ | ----------- |
| `XdgConfigLiveOptions<A>` | Options for `XdgConfigLive` (`{ app, config }`) |
| `XdgConfigPresetOptions<A>` | Options for `XdgConfigLive.toml()` / `.json()` (`{ namespace, filename, tag, schema, validate? }`) |
| `XdgConfigMultiOptions` | Options for `XdgConfigLive.multi()` (`{ namespace, configs }`) |
| `XdgFullLiveOptions<A>` | Options for `XdgFullLive` (`{ app, config, migrations }`) |
| `XdgResolverTestOptions` | Options for `XdgResolver.Test()` (override individual XDG paths) |

## Schemas

| Export | Description |
| ------ | ----------- |
| `AppDirsConfig` | Configuration for `AppDirs` (namespace, fallbackDir, dirs) |
| `ResolvedAppDirs` | Resolved directory paths (config, data, cache, state, runtime) |
| `XdgPaths` | Raw XDG environment variable values |
| `CacheEntry` | SQLite cache entry with value, TTL, tags |
| `CacheEvent` / `CacheEventPayload` | PubSub event types for cache observability |
| `MigrationStatus` | Migration applied/pending status |

## Errors

| Error | Tag | Fields | Raised when |
| ----- | --- | ------ | ----------- |
| `XdgError` | `"XdgError"` | `message` | `HOME` not set |
| `AppDirsError` | `"AppDirsError"` | `directory`, `reason` | Directory resolution fails |
| `CacheError` | `"CacheError"` | `operation`, `key?`, `reason` | Cache operation fails |
| `StateError` | `"StateError"` | `operation`, `reason` | Migration or state operation fails |

```typescript
type XdgEffectError = XdgError | AppDirsError | CacheError | StateError;
```

Config file errors (`ConfigError`, `CodecError`) are defined in config-file-effect. JSON Schema errors (`JsonSchemaError`, `JsonSchemaValidationError`) are defined in json-schema-effect.

---

[Previous: Error Handling](./08-error-handling.md)
