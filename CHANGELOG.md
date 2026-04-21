# xdg-effect

## 0.2.0

### Breaking Changes

* [`59a9b36`](https://github.com/spencerbeggs/xdg-effect/commit/59a9b36064064bd13dda73e4ab5485cfe1d27908) All six layer factories have moved from standalone exports to static properties on their service tag classes. Import and compose layers via the service tag instead of named layer exports:

  ```ts
  // Before
  import { AppDirsLive, XdgResolverLive } from "xdg-effect";

  // After
  import { AppDirs, XdgResolver } from "xdg-effect";
  AppDirs.Live;
  XdgResolver.Live;
  ```

  Affected services: `AppDirs`, `XdgResolver`, `JsonSchemaExporter`, `SqliteCache`, `SqliteState`, and `ConfigFile`.

* `ConfigFile` is now a plain namespace object (`{ Tag, Live, Test }`) rather than a class. The former `makeConfigFileTag` and `makeConfigFileLive` helpers are removed; use `ConfigFile.Tag` and `ConfigFile.Live` instead:

  ```ts
  // Before
  import { makeConfigFileTag, makeConfigFileLive } from "xdg-effect";
  const MyConfig = makeConfigFileTag<Config>("my-app");
  const layer = makeConfigFileLive(MyConfig, options);

  // After
  import { ConfigFile } from "xdg-effect";
  const MyConfig = ConfigFile.Tag<Config>("my-app");
  const layer = ConfigFile.Live(options).pipe(Layer.provide(...));
  ```

* Standalone layer exports (`AppDirsLive`, `XdgResolverLive`, etc.) are removed from the barrel. All layer composition now goes through service tag statics.

### Features

* [`59a9b36`](https://github.com/spencerbeggs/xdg-effect/commit/59a9b36064064bd13dda73e4ab5485cfe1d27908) `AppDirsConfig` now accepts a minimal `{ namespace }` constructor. The `fallbackDir` and `dirs` fields are optional and default to `Option.none()`, eliminating the need to supply empty option values when creating a basic config.

* `AppDirsService` gains four directory-ensuring methods that resolve the path and create the directory if it does not exist: `ensureConfig`, `ensureData`, `ensureCache`, and `ensureState`. Each returns `Effect<string, AppDirsError>`.

* `ConfigFileService` gains three new methods:
  * `loadOrDefault(defaultValue: A)` — loads the config file, returning `defaultValue` if no file is found rather than failing.
  * `save(value: A)` — writes `value` to the path specified by `defaultPath` in `ConfigFileOptions`.
  * `update(fn, defaultValue?)` — loads (or falls back to `defaultValue`), applies `fn`, saves the result, and returns the updated value.

* `ConfigFileOptions` has a new optional `defaultPath` field (accepts a plain string or an `Effect<string, ConfigError, AppDirs>`). Required by `save` and `update`.

* New `XdgSavePath(filename)` resolver helper builds a `defaultPath` effect that resolves to `<xdgConfigDir>/<filename>`, intended for use with the `defaultPath` option in `ConfigFileOptions`.

* All six services now expose a `Test` static that provides a scoped in-memory or temp-directory layer suitable for unit tests, with automatic cleanup on scope close:
  * `AppDirs.Test` — mounts a scoped temp directory tree
  * `XdgResolver.Test` — resolves configurable in-memory XDG paths
  * `ConfigFile.Test` — pre-populates files in a scoped temp directory
  * `JsonSchemaExporter.Test` — scoped temp directory for schema output
  * `SqliteCache.Test` — in-memory SQLite cache
  * `SqliteState.Test` — in-memory SQLite state store

### Bug Fixes

* [`59a9b36`](https://github.com/spencerbeggs/xdg-effect/commit/59a9b36064064bd13dda73e4ab5485cfe1d27908) `XdgResolverLive` and `JsonSchemaExporterLive` are now factory functions rather than eagerly-evaluated layer values, resolving ESM circular import errors that surfaced when importing from certain bundler entry points.

## 0.1.0

### Features

* [`8c56d48`](https://github.com/spencerbeggs/xdg-effect/commit/8c56d484cb1ce04c0e019a5ebd5d1a67f77e5edb) ### XDG Base Directory Support

Opinionated Effect library providing composable layers for XDG Base Directory support, from environment resolution through config file management to SQLite-backed caching and persistent state.

### Documentation

* [`8c56d48`](https://github.com/spencerbeggs/xdg-effect/commit/8c56d484cb1ce04c0e019a5ebd5d1a67f77e5edb) README with installation, quick-start example, progressive adoption table, and complete API export tables
* 10 progressive guides in `docs/` covering all services, codecs, resolvers, strategies, error handling, testing patterns, and `@effect/cli` integration
* Runnable TypeScript code examples throughout, with inline API references

### Services

* **XdgResolver** — Reads XDG Base Directory environment variables (`XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `XDG_STATE_HOME`, `XDG_RUNTIME_DIR`) via Effect's `Config` module. Each variable resolves to an `Option`, with `HOME` returned as a required string.
* **AppDirs** — Resolves app-namespaced directories with a four-level precedence chain: explicit override > XDG env var + namespace > `fallbackDir` > `$HOME/.namespace`. Includes an `ensure()` method that creates directories on demand.
* **ConfigFile** — Generic config file loading with pluggable codecs (`JsonCodec`, `TomlCodec`), composable resolvers (`ExplicitPath`, `StaticDir`, `UpwardWalk`, `XdgConfig`, `WorkspaceRoot`), and two merge strategies (`FirstMatch`, `LayeredMerge`).
* **JsonSchemaExporter** — Build-time helper that generates JSON Schema from Effect Schemas. Inlines root `$ref` for Tombi LSP compatibility, supports `x-tombi` annotations, and uses deep-equal diffing to skip unchanged file writes.
* **SqliteCache** — Key/value cache backed by SQLite via `@effect/sql`. Supports TTL-based expiry, tag-based invalidation, manual purging, and PubSub observability events.
* **SqliteState** — Managed SQLite database with numbered user-defined migrations (up/down), auto-migration on construction, rollback support, and raw `SqlClient` access.

### Aggregate Layers

Three pre-composed layers for progressive adoption:

* `XdgLive` — Provides `XdgResolver` + `AppDirs`
* `XdgConfigLive` — Extends `XdgLive` with `ConfigFile`
* `XdgFullLive` — Extends `XdgConfigLive` with `SqliteCache` and `SqliteState`

### Error Handling

Seven tagged error types using the `Data.TaggedError` pattern: `XdgError`, `AppDirsError`, `CodecError`, `ConfigError`, `JsonSchemaError`, `CacheError`, and `StateError`. All share the `XdgEffectError` union type for catch-all handling.
