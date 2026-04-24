---
"xdg-effect": major
---

## Breaking Changes

`xdg-effect` has been split into a three-package ecosystem. The JSON Schema and ConfigFile subsystems now live in dedicated packages (`json-schema-effect` and `config-file-effect`), and `xdg-effect` re-exports their public APIs for single-import convenience. Consumers who import directly from `xdg-effect` will continue to get the same symbols, but those who depend on the internal source paths or the now-removed error union members must migrate.

### Removed source modules

The following modules are no longer part of this package's source tree. They are now owned by `json-schema-effect` or `config-file-effect`. Imports from the `xdg-effect` package entry point still work (via re-exports), but any path imports (e.g. `xdg-effect/src/codecs/...`) must be updated:

- `JsonSchemaExporter`, `JsonSchemaValidator`, `JsonSchemaClass`, `Jsonifiable`, `WriteResult`
- `taplo`, `tombi` annotation helpers
- `JsonSchemaError`, `JsonSchemaValidationError`
- `ConfigFile`, `ConfigCodec`, `JsonCodec`, `TomlCodec`
- All config resolvers (`ExplicitPath`, `FirstMatch`, `GitRoot`, `StaticDir`, `UpwardWalk`, `WorkspaceRoot`) and merge strategies (`LayeredMerge`, `VersionAccess`, `ConfigWalkStrategy`)
- `ConfigError`, `CodecError`

### Reduced error union

`XdgEffectError` now covers only the four errors owned by this package. The removed members (`ConfigError`, `CodecError`, `JsonSchemaError`, `JsonSchemaValidationError`) are still re-exported from `xdg-effect` but belong to the `XdgEffectError` unions of their respective packages.

**Before:**

```typescript
// XdgEffectError was a union of 8 types
type XdgEffectError =
  | XdgError
  | AppDirsError
  | CacheError
  | StateError
  | ConfigError
  | CodecError
  | JsonSchemaError
  | JsonSchemaValidationError;
```

**After:**

```typescript
// XdgEffectError is a union of 4 types
type XdgEffectError = XdgError | AppDirsError | CacheError | StateError;
```

### Renamed resolver

`XdgConfig` resolver has been renamed to `XdgConfigResolver`. The old name is kept as a deprecated re-export and will be removed in a future release.

```typescript
// Before (still works but deprecated)
import { XdgConfig } from "xdg-effect";

// After
import { XdgConfigResolver } from "xdg-effect";
```

### Removed direct dependencies

- `smol-toml` is no longer a direct dependency (now transitive via `config-file-effect`)
- `ajv` is no longer listed in `peerDependencies` (now transitive via `json-schema-effect`)

## Features

### Preset factory layers

`XdgConfigLive.toml()` and `XdgConfigLive.json()` reduce a full XDG config-file setup from eight concepts to four. Pass your app namespace, schema class, and default value — the layer handles codec, resolver, and file management automatically:

```typescript
const AppConfig = XdgConfigLive.toml({
  namespace: { org: "acme", app: "my-cli" },
  schema: MyConfigSchema,
  defaults: MyConfigSchema.make({ theme: "dark" }),
});
```

### Multi-file config layer

`XdgConfigLive.multi()` composes multiple config files under a single XDG layer, each with its own schema and codec:

```typescript
const Configs = XdgConfigLive.multi({
  namespace: { org: "acme", app: "my-cli" },
  files: [
    { id: "app", schema: AppSchema, codec: TomlCodec, defaults: appDefaults },
    { id: "theme", schema: ThemeSchema, codec: JsonCodec, defaults: themeDefaults },
  ],
});
```

### XDG-path-aware SQLite factories

`SqliteCache.XdgLive()` and `SqliteState.XdgLive()` create SQLite layers that resolve their database paths through `AppDirs`, eliminating manual path wiring:

```typescript
const Cache = SqliteCache.XdgLive({ filename: "cache.db" });
const State = SqliteState.XdgLive({ filename: "state.db", migrations });
```

### Upgraded dependencies

- `config-file-effect` upgraded to 0.2.0 — adds `EncryptedCodec`, config change events, file-level migrations, and a file watcher
- `json-schema-effect` upgraded to 0.2.0 — adds JSON Schema scaffolding support (`JsonSchemaScaffolder`, `scaffoldJson`, `scaffoldToml`)

## Tests

- 13 new tests added (42 to 55 total) covering XDG bridge layers, `XdgFullLive` aggregate, `XdgConfigLive` presets, multi-config composition, XDG-aware SQLite, and error path edge cases

## Documentation

- Docs reorganized and rewritten for the three-package ecosystem
- Added examples for preset factories (`XdgConfigLive.toml`, `XdgConfigLive.json`) and re-export usage
- Removed guides for ConfigFile internals and JSON Schema generation (now in their respective package docs)
