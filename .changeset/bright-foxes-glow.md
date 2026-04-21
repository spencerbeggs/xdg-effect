---
"xdg-effect": minor
---

## Features

### XDG Base Directory Support

Opinionated Effect library providing composable layers for XDG Base Directory support, from environment resolution through config file management to SQLite-backed caching and persistent state.

### Services

- **XdgResolver** — Reads XDG Base Directory environment variables (`XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `XDG_STATE_HOME`, `XDG_RUNTIME_DIR`) via Effect's `Config` module. Each variable resolves to an `Option`, with `HOME` returned as a required string.
- **AppDirs** — Resolves app-namespaced directories with a four-level precedence chain: explicit override > XDG env var + namespace > `fallbackDir` > `$HOME/.namespace`. Includes an `ensure()` method that creates directories on demand.
- **ConfigFile** — Generic config file loading with pluggable codecs (`JsonCodec`, `TomlCodec`), composable resolvers (`ExplicitPath`, `StaticDir`, `UpwardWalk`, `XdgConfig`, `WorkspaceRoot`), and two merge strategies (`FirstMatch`, `LayeredMerge`).
- **JsonSchemaExporter** — Build-time helper that generates JSON Schema from Effect Schemas. Inlines root `$ref` for Tombi LSP compatibility, supports `x-tombi` annotations, and uses deep-equal diffing to skip unchanged file writes.
- **SqliteCache** — Key/value cache backed by SQLite via `@effect/sql`. Supports TTL-based expiry, tag-based invalidation, manual purging, and PubSub observability events.
- **SqliteState** — Managed SQLite database with numbered user-defined migrations (up/down), auto-migration on construction, rollback support, and raw `SqlClient` access.

### Aggregate Layers

Three pre-composed layers for progressive adoption:

- `XdgLive` — Provides `XdgResolver` + `AppDirs`
- `XdgConfigLive` — Extends `XdgLive` with `ConfigFile`
- `XdgFullLive` — Extends `XdgConfigLive` with `SqliteCache` and `SqliteState`

### Error Handling

Seven tagged error types using the `Data.TaggedError` pattern: `XdgError`, `AppDirsError`, `CodecError`, `ConfigError`, `JsonSchemaError`, `CacheError`, and `StateError`. All share the `XdgEffectError` union type for catch-all handling.

## Documentation

- README with installation, quick-start example, progressive adoption table, and complete API export tables
- 10 progressive guides in `docs/` covering all services, codecs, resolvers, strategies, error handling, testing patterns, and `@effect/cli` integration
- Runnable TypeScript code examples throughout, with inline API references
