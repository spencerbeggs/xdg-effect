---
status: current
module: xdg-effect
category: architecture
created: 2026-04-20
updated: 2026-04-22
last-synced: 2026-04-22
completeness: 80
related: []
dependencies: []
---

# xdg-effect - Architecture

Opinionated Effect library providing composable layers for XDG Base Directory
support, from environment resolution through config file management to
SQLite-backed caching and persistent state.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [System Architecture](#system-architecture)
5. [Data Flow](#data-flow)
6. [Integration Points](#integration-points)
7. [Testing Strategy](#testing-strategy)
8. [Future Enhancements](#future-enhancements)
9. [Related Documentation](#related-documentation)

---

## Overview

xdg-effect solves the problem of portable, testable XDG Base Directory support
in Effect applications. Rather than scattering `process.env.XDG_CONFIG_HOME`
reads throughout a codebase, the library provides a progressive stack of seven
composable Effect layers that build upon each other -- from raw environment
variable resolution up through config file loading, JSON Schema validation,
and SQLite-backed storage.

The library is designed for CLI tools, developer tooling, and any Node.js
application that needs to respect the XDG Base Directory Specification while
remaining fully testable through Effect's dependency injection model.

**Key Design Principles:**

- **Progressive composition:** Each layer builds on the previous ones. Consumers
  adopt only what they need (path resolution, config files, SQLite caching, or
  the full stack).
- **Effect-native dependency injection:** All services are Effect `Context.Tag`
  values. Layers compose via `Layer.mergeAll` and `Layer.provide`. No globals,
  no singletons, no `process.env` reads at import time.
- **Testability through ConfigProvider:** Environment variables are read through
  Effect's `Config` module, not `process.env`. Tests swap in a custom
  `ConfigProvider` to control all inputs without touching the real environment.
- **Platform abstraction:** All filesystem and path operations use
  `@effect/platform` (`FileSystem`), enabling future multi-runtime support
  (Node, Bun, Deno).
- **Pluggable extension points:** Codecs, resolvers, and merge strategies are
  interfaces with built-in implementations. Consumers can provide custom
  implementations without forking.

**When to reference this document:**

- When adding new services or layers to the library
- When modifying the layer composition or dependency graph
- When integrating xdg-effect into a consuming application
- When debugging service resolution or layer wiring issues
- When adding new codecs, resolvers, or strategies

---

## Current State

### Module Structure

Single package with a barrel export at `src/index.ts`. No internal barrel
files. The source tree is organized by responsibility:

```text
src/
  index.ts              # Single barrel export
  codecs/               # Pluggable config file format parsers
  errors/               # Data.TaggedError types with Base exports
  helpers/              # Annotation helpers (tombi, taplo)
  layers/               # Layer.Layer implementations (Live variants)
  resolvers/            # Config file location strategies
  schemas/              # Effect Schema classes (data shapes)
  services/             # Context.Tag service interfaces
  strategies/           # Config resolution merge strategies
```

### System Components

#### Component 1: XdgResolver

**Location:** `src/services/XdgResolver.ts`, `src/layers/XdgResolverLive.ts`

**Purpose:** Reads XDG Base Directory environment variables through Effect's
`Config` module and exposes them as typed Effect values.

**Responsibilities:**

- Read `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`,
  `XDG_STATE_HOME`, and `XDG_RUNTIME_DIR` as `Option<string>` values
- Read `HOME` as a required `string` (fails with `XdgError` if missing)
- Provide `resolveAll` to batch-read all XDG paths into an `XdgPaths` schema

**Key interfaces/APIs:**

```typescript
interface XdgResolverService {
  readonly configHome: Effect.Effect<Option.Option<string>>;
  readonly dataHome: Effect.Effect<Option.Option<string>>;
  readonly cacheHome: Effect.Effect<Option.Option<string>>;
  readonly stateHome: Effect.Effect<Option.Option<string>>;
  readonly runtimeDir: Effect.Effect<Option.Option<string>>;
  readonly home: Effect.Effect<string, XdgError>;
  readonly resolveAll: Effect.Effect<XdgPaths, XdgError>;
}
```

**Dependencies:**

- Depends on: Effect `ConfigProvider` (for environment variable access)
- Used by: AppDirs, XdgConfig resolver

**Layer type:** `Layer.Layer<XdgResolver>` -- no requirements (environment
variables come from the ambient `ConfigProvider`).

#### Component 2: AppDirs

**Location:** `src/services/AppDirs.ts`, `src/layers/AppDirsLive.ts`

**Purpose:** Given an application namespace, resolves concrete directory paths
using a 4-level precedence system.

**Responsibilities:**

- Resolve config, data, cache, state, and runtime directories for a named app
- Apply 4-level precedence: explicit override > XDG env + namespace >
  fallbackDir > `$HOME/.namespace`
- Create all resolved directories on disk via `ensure`

**Key interfaces/APIs:**

```typescript
interface AppDirsService {
  readonly config: Effect.Effect<string, AppDirsError>;
  readonly data: Effect.Effect<string, AppDirsError>;
  readonly cache: Effect.Effect<string, AppDirsError>;
  readonly state: Effect.Effect<string, AppDirsError>;
  readonly runtime: Effect.Effect<Option.Option<string>, AppDirsError>;
  readonly resolveAll: Effect.Effect<ResolvedAppDirs, AppDirsError>;
  readonly ensure: Effect.Effect<ResolvedAppDirs, AppDirsError>;
}
```

**Dependencies:**

- Depends on: XdgResolver, FileSystem (`@effect/platform`)
- Used by: XdgConfig resolver, aggregate layers

**Layer type:** `Layer.Layer<AppDirs, never, XdgResolver | FileSystem>` --
constructed via `AppDirsLive(config)` factory function taking `AppDirsConfig`.

#### Component 3: ConfigFile

**Location:** `src/services/ConfigFile.ts`, `src/layers/ConfigFileLive.ts`

**Purpose:** Generic config file loading with pluggable codecs, composable
resolvers, and merge strategies.

**Responsibilities:**

- Discover config files across multiple locations using resolver chain
- Parse file content using pluggable codecs (JSON, TOML)
- Validate parsed data against an Effect `Schema`
- Resolve multiple sources into a single config value using a strategy
- Write config files back to disk with encode + serialize

**Key interfaces/APIs:**

```typescript
interface ConfigFileService<A> {
  readonly load: Effect.Effect<A, ConfigError>;
  readonly loadFrom: (path: string) => Effect.Effect<A, ConfigError>;
  readonly discover: Effect.Effect<ReadonlyArray<ConfigSource<A>>, ConfigError>;
  readonly write: (value: A, path: string) => Effect.Effect<void, ConfigError>;
}

// Factory for type-parameterized tags
const makeConfigFileTag = <A>(id: string) =>
  Context.GenericTag<ConfigFileService<A>>(`xdg-effect/ConfigFile/${id}`);
```

**Dependencies:**

- Depends on: FileSystem (`@effect/platform`)
- Used by: Aggregate layers (XdgConfigLive, XdgFullLive)

**Layer type:** `Layer.Layer<ConfigFileService<A>, never, FileSystem>` --
constructed via `makeConfigFileLive(options)` factory function.

**Design note:** Uses `Context.GenericTag` because Effect's `Context.Tag` does
not support type parameters. Each config schema gets a unique tag keyed by a
string identifier.

#### Component 4: JsonSchemaExporter

**Location:** `src/services/JsonSchemaExporter.ts`,
`src/layers/JsonSchemaExporterLive.ts`

**Purpose:** Build-time helper that generates JSON Schema files from Effect
Schema definitions.

**Responsibilities:**

- Generate JSON Schema from Effect `Schema` using `JSONSchema.make`
- Inline `$ref` root definitions for Tombi (TOML tooling) compatibility
- Run `cleanSchema` pass to strip artifacts (`/schemas/unknown` $id, empty
  `required` arrays, empty `properties` on Record objects)
- Inject top-level `$id` from `SchemaEntry.$id` for SchemaStore compatibility
- Apply custom annotations (e.g., `x-tombi`, `x-taplo` extensions)
- Diff against existing files using `deepEqual` to skip unchanged writes
- Create parent directories as needed

**Key interfaces/APIs:**

```typescript
interface JsonSchemaExporterService {
  readonly generate: (entry: SchemaEntry) => Effect.Effect<JsonSchemaOutput, JsonSchemaError>;
  readonly generateMany: (
    entries: ReadonlyArray<SchemaEntry>,
  ) => Effect.Effect<ReadonlyArray<JsonSchemaOutput>, JsonSchemaError>;
  readonly write: (
    output: JsonSchemaOutput, path: string,
  ) => Effect.Effect<WriteResult, JsonSchemaError>;
  readonly writeMany: (
    outputs: ReadonlyArray<{ output: JsonSchemaOutput; path: string }>,
  ) => Effect.Effect<ReadonlyArray<WriteResult>, JsonSchemaError>;
}
```

**Dependencies:**

- Depends on: FileSystem (`@effect/platform`)
- Used by: Build scripts, CLI tooling

**Layer type:** `Layer.Layer<JsonSchemaExporter, never, FileSystem>`.

#### Component 4b: JsonSchemaValidator

**Location:** `src/services/JsonSchemaValidator.ts`,
`src/layers/JsonSchemaValidatorLive.ts`

**Purpose:** Validates generated JSON Schema output using Ajv with optional
strict-mode checks for SchemaStore and Tombi compatibility.

**Responsibilities:**

- Compile generated schemas through Ajv to catch structural errors
- In strict mode, walk the schema tree to flag objects with `properties` but
  no `additionalProperties` (Tombi treats these as closed)
- Validate single or batch outputs, collecting all errors before failing

**Key interfaces/APIs:**

```typescript
interface JsonSchemaValidatorService {
  readonly validate: (
    output: JsonSchemaOutput,
    options?: ValidatorOptions,
  ) => Effect.Effect<JsonSchemaOutput, JsonSchemaValidationError>;
  readonly validateMany: (
    outputs: ReadonlyArray<JsonSchemaOutput>,
    options?: ValidatorOptions,
  ) => Effect.Effect<ReadonlyArray<JsonSchemaOutput>, JsonSchemaValidationError>;
}

interface ValidatorOptions {
  readonly strict?: boolean;
}
```

**Dependencies:**

- Depends on: `ajv` (optional peer, dynamically imported)
- Used by: Build scripts, CI validation pipelines

**Layer type:** `Layer.Layer<JsonSchemaValidator>` -- no service requirements
(Ajv is loaded via dynamic import).

#### Component 5: SqliteCache

**Location:** `src/services/SqliteCache.ts`, `src/layers/SqliteCacheLive.ts`

**Purpose:** Opinionated key/value cache backed by SQLite with TTL expiry,
tag-based invalidation, and PubSub observability.

**Responsibilities:**

- Store and retrieve binary blobs keyed by string
- Support TTL-based automatic expiry (checked on read, bulk-pruned on demand)
- Tag entries for grouped invalidation
- Emit cache events (hit, miss, set, invalidate, prune, expire) via PubSub
- List all entry metadata for introspection

**Key interfaces/APIs:**

```typescript
interface SqliteCacheService {
  readonly get: (key: string) => Effect.Effect<Option.Option<CacheEntry>, CacheError>;
  readonly set: (params: {
    readonly key: string;
    readonly value: Uint8Array;
    readonly contentType?: string;
    readonly tags?: ReadonlyArray<string>;
    readonly ttl?: Duration.Duration;
  }) => Effect.Effect<void, CacheError>;
  readonly invalidate: (key: string) => Effect.Effect<void, CacheError>;
  readonly invalidateByTag: (tag: string) => Effect.Effect<void, CacheError>;
  readonly invalidateAll: Effect.Effect<void, CacheError>;
  readonly prune: Effect.Effect<PruneResult, CacheError>;
  readonly has: (key: string) => Effect.Effect<boolean, CacheError>;
  readonly entries: Effect.Effect<ReadonlyArray<CacheEntryMeta>, CacheError>;
  readonly events: PubSub.PubSub<CacheEvent>;
}
```

**Dependencies:**

- Depends on: SqlClient (`@effect/sql`)
- Used by: Aggregate layer (XdgFullLive)

**Layer type:** `Layer.Layer<SqliteCache, never, SqlClient>` -- constructed
via `makeSqliteCacheLive()`.

#### Component 6: SqliteState

**Location:** `src/services/SqliteState.ts`, `src/layers/SqliteStateLive.ts`

**Purpose:** Managed SQLite database with user-defined migrations for
persistent application state.

**Responsibilities:**

- Auto-run pending migrations on layer construction
- Track applied migrations in `_xdg_migrations` table
- Support rollback to a specific migration ID (with optional `down` functions)
- Report migration status (applied vs pending)
- Expose the raw `SqlClient` for custom queries

**Key interfaces/APIs:**

```typescript
interface SqliteStateService {
  readonly client: SqlClient.SqlClient;
  readonly migrate: Effect.Effect<MigrationResult, StateError>;
  readonly rollback: (toId: number) => Effect.Effect<MigrationResult, StateError>;
  readonly status: Effect.Effect<ReadonlyArray<MigrationStatus>, StateError>;
}
```

**Dependencies:**

- Depends on: SqlClient (`@effect/sql`)
- Used by: Aggregate layer (XdgFullLive)

**Layer type:** `Layer.Layer<SqliteState, never, SqlClient>` -- constructed
via `makeSqliteStateLive({ migrations })`.

### Pluggable Extension Points

#### Codecs

Interface `ConfigCodec` (at `src/codecs/ConfigCodec.ts`) with two built-in
implementations:

| Codec | File | Extensions |
| ----- | ---- | ---------- |
| `JsonCodec` | `src/codecs/JsonCodec.ts` | `.json` |
| `TomlCodec` | `src/codecs/TomlCodec.ts` | `.toml` |

Each codec provides `parse(raw) -> Effect<unknown, CodecError>` and
`stringify(value) -> Effect<string, CodecError>`. TomlCodec bundles `smol-toml`
as the only non-peer runtime dependency.

#### Resolvers

Interface `ConfigResolver<R>` (at `src/resolvers/ConfigResolver.ts`) with five
built-in implementations:

| Resolver | File | Requirements | Strategy |
| -------- | ---- | ------------ | -------- |
| `ExplicitPath` | `src/resolvers/ExplicitPath.ts` | FileSystem | Check if a specific path exists |
| `StaticDir` | `src/resolvers/StaticDir.ts` | FileSystem | Check for filename in a known directory |
| `UpwardWalk` | `src/resolvers/UpwardWalk.ts` | FileSystem | Walk up from cwd looking for filename |
| `XdgConfig` | `src/resolvers/XdgConfig.ts` | FileSystem, AppDirs | Check in the XDG config directory |
| `WorkspaceRoot` | `src/resolvers/WorkspaceRoot.ts` | FileSystem | Find monorepo root (pnpm-workspace.yaml or package.json workspaces) |

Each resolver returns `Effect<Option<string>, never, R>` -- errors are caught
and treated as "not found". The `R` type parameter captures requirements so
they flow through to the layer graph.

#### Strategies

Interface `ConfigWalkStrategy<A>` (at `src/strategies/ConfigWalkStrategy.ts`)
with two built-in implementations:

| Strategy | File | Behavior |
| -------- | ---- | -------- |
| `FirstMatch` | `src/strategies/FirstMatch.ts` | Return value from highest-priority source |
| `LayeredMerge` | `src/strategies/LayeredMerge.ts` | Deep-merge all sources, higher-priority wins on conflicts |

#### Helpers

Pure functions for building TOML tooling annotations. Located in `src/helpers/`.

| Helper | File | Purpose |
| ------ | ---- | ------- |
| `tombi(options)` | `src/helpers/tombi.ts` | Builds `x-tombi-*` annotation keys from typed `TombiOptions` |
| `taplo(options)` | `src/helpers/taplo.ts` | Builds `{ "x-taplo": { ... } }` annotation from typed `TaploOptions` |

These are composable via spread (`{ ...tombi(opts), ...taplo(opts) }`) and
intended for use in Effect Schema `jsonSchema` annotations or
`SchemaEntry.annotations`.

#### Schema Utilities

Additional schema helpers beyond the core data shapes:

| Utility | File | Purpose |
| ------- | ---- | ------- |
| `Jsonifiable` | `src/schemas/Jsonifiable.ts` | `Schema.Unknown` variant that emits `{}` in JSON Schema instead of `/schemas/unknown`, compatible with Ajv strict mode |
| `JsonSchemaClass` | `src/schemas/JsonSchemaClass.ts` | `Schema.Class` wrapper that bundles `$id`, `schemaEntry`, `toJson`, and `validate` statics onto the class constructor |

`JsonSchemaClass` usage pattern:

```typescript
class AppConfig extends JsonSchemaClass<AppConfig>("AppConfig", {
  $id: "https://json.schemastore.org/app-config.json",
})({
  name: Schema.String,
  port: Schema.Number,
}) {}
```

Statics: `AppConfig.$id`, `AppConfig.schemaEntry`, `AppConfig.toJson(inst)`,
`AppConfig.validate(raw)`.

### Architecture Diagram

```text
                  Consumer Application
                         |
           +-------------+-------------+
           |             |             |
     XdgLive(cfg)  XdgConfigLive  XdgFullLive
     (layers 1-2)  (layers 1-3)  (layers 1-6)
           |             |             |
  +--------+--------+   |   +---------+---------+
  |                 |    |   |         |         |
  v                 v    v   v         v         v
XdgResolverLive  AppDirsLive  ConfigFileLive  SqliteCacheLive  SqliteStateLive
  (Layer 1)      (Layer 2)    (Layer 3)       (Layer 5)        (Layer 6)
  |              |            |               |                |
  |              +---> XdgResolver            |                |
  |              +---> FileSystem             |                |
  v                   |                       v                v
  Config              v                    SqlClient        SqlClient
  (env vars)       FileSystem             (@effect/sql)    (@effect/sql)
                 (@effect/platform)
```

**Aggregate layer composition:**

- `XdgLive(config)` = `XdgResolverLive` + `AppDirsLive(config)`, requires
  `FileSystem`
- `XdgConfigLive(options)` = `XdgLive` + `makeConfigFileLive`, requires
  `FileSystem`
- `XdgFullLive(options)` = `XdgConfigLive` + `makeSqliteCacheLive` +
  `makeSqliteStateLive`, requires `FileSystem` + `SqlClient`

### Error Types

All errors extend `Data.TaggedError` and export a `Base` class for
api-extractor compatibility:

| Error | Tag | Key Fields |
| ----- | --- | ---------- |
| `XdgError` | `"XdgError"` | `message` |
| `AppDirsError` | `"AppDirsError"` | `directory`, `reason` |
| `ConfigError` | `"ConfigError"` | `operation`, `path?`, `reason` |
| `CodecError` | `"CodecError"` | `codec`, `operation`, `reason` |
| `JsonSchemaError` | `"JsonSchemaError"` | `operation`, `name?`, `reason` |
| `JsonSchemaValidationError` | `"JsonSchemaValidationError"` | `name`, `errors` |
| `CacheError` | `"CacheError"` | `operation`, `key?`, `reason` |
| `StateError` | `"StateError"` | `operation`, `reason` |

The union type `XdgEffectError` (at `src/errors/types.ts`) collects all error
types for consumers who want a catch-all handler.

### Schemas

Effect `Schema.Class` definitions for structured data:

| Schema | File | Purpose |
| ------ | ---- | ------- |
| `XdgPaths` | `src/schemas/XdgPaths.ts` | Resolved XDG directory paths (home required, others optional) |
| `AppDirsConfig` | `src/schemas/AppDirsConfig.ts` | Configuration input for AppDirs (namespace, fallbackDir, per-dir overrides) |
| `ResolvedAppDirs` | `src/schemas/ResolvedAppDirs.ts` | Concrete directory paths after resolution |
| `CacheEntry` | `src/schemas/CacheEntry.ts` | Single cache entry with key, value (Uint8Array), TTL, tags |
| `CacheEvent` | `src/schemas/CacheEvent.ts` | Tagged union of cache observability events |
| `Jsonifiable` | `src/schemas/Jsonifiable.ts` | JSON-safe `Schema.Unknown` variant emitting `{}` in JSON Schema |
| `JsonSchemaClass` | `src/schemas/JsonSchemaClass.ts` | Schema.Class factory with `$id`, `schemaEntry`, `toJson`, `validate` statics |
| `MigrationStatus` | `src/schemas/MigrationStatus.ts` | Migration ID + name + optional applied timestamp |
| `WriteResult` | `src/schemas/WriteResult.ts` | Tagged union: Written or Unchanged (used by JsonSchemaExporter) |

### Current Limitations

- **Single-process SQLite only:** The cache and state layers assume exclusive
  access to the SQLite database. Concurrent multi-process access is not
  handled (no WAL mode, no advisory locking).
- **No watch/reload for config files:** Config is loaded once. There is no
  filesystem watcher or polling mechanism for live config reloading.
- **Tag-based invalidation uses LIKE:** SQLiteCache stores tags as JSON arrays
  in a TEXT column. Tag-based invalidation uses `LIKE '%"tag"%'`, which is
  correct but not indexed efficiently for large caches.
- **No built-in config file migration:** ConfigFile loads and validates against
  a schema but has no mechanism for migrating config files between schema
  versions.

---

## Rationale

### Architectural Decisions

#### Decision 1: Effect's Config module for environment variables

**Context:** XDG directories are determined by environment variables
(`XDG_CONFIG_HOME`, etc.). The library needs to read these values at runtime.

**Options considered:**

1. **Effect `Config` module (Chosen):**
   - Pros: Testable via `ConfigProvider.fromMap`, composes with Effect's
     dependency model, no global state
   - Cons: Slightly more verbose than direct `process.env` access
   - Why chosen: Enables deterministic testing without mocking `process.env`
     or using `vi.stubEnv`. Tests can provide exact environment values through
     `Effect.provide(Layer.setConfigProvider(...))`.

2. **Direct `process.env` access:**
   - Pros: Simple, familiar, zero overhead
   - Cons: Global mutable state, requires test cleanup, platform-specific
   - Why rejected: Antithetical to Effect's pure-functional model; makes tests
     fragile and order-dependent.

#### Decision 2: `@effect/platform` for all filesystem operations

**Context:** The library needs to read/write files and create directories.

**Options considered:**

1. **`@effect/platform` FileSystem (Chosen):**
   - Pros: Platform-agnostic, testable (can provide mock FileSystem), aligns
     with Effect ecosystem conventions
   - Cons: Requires consumers to provide a platform layer
     (`NodeFileSystem.layer`)
   - Why chosen: Enables future Bun/Deno support and allows tests to use
     in-memory filesystem implementations.

2. **Node.js `fs` module directly:**
   - Pros: No extra dependency, simpler layer graph
   - Cons: Locks to Node.js, harder to test without real filesystem
   - Why rejected: Defeats the purpose of building on Effect.

#### Decision 3: `Context.GenericTag` for ConfigFile type parameter

**Context:** `ConfigFileService<A>` is generic over the configuration type.
Effect's `Context.Tag` requires a fixed type at the class level and does not
support type parameters.

**Options considered:**

1. **`Context.GenericTag` factory (Chosen):**
   - Pros: Each config schema gets its own uniquely-keyed tag, type-safe,
     multiple ConfigFile services can coexist in the same layer graph
   - Cons: Requires a factory function (`makeConfigFileTag`), slightly unusual
     API surface
   - Why chosen: The only mechanism Effect provides for type-parameterized
     context entries.

2. **Fixed tag with runtime cast:**
   - Pros: Simpler API
   - Cons: Loses type safety, only one ConfigFile per application
   - Why rejected: Unsafe and limiting.

#### Decision 4: 4-level resolution precedence

**Context:** Applications need flexibility in how directories are determined.

**Precedence (highest to lowest):**

1. Explicit per-directory override (via `AppDirsConfig.dirs`)
2. XDG environment variable + namespace (e.g., `$XDG_CONFIG_HOME/myapp`)
3. Fallback directory under HOME (e.g., `$HOME/.config-alt`)
4. Default: `$HOME/.namespace` (e.g., `$HOME/.myapp`)

**Why this order:** Explicit overrides give the consumer full control. XDG env
vars are the standard mechanism. The fallback directory handles non-standard
setups. The final default ensures the library always resolves to something
concrete -- it never assumes XDG defaults unless the user explicitly sets the
environment variables.

#### Decision 5: PubSub for cache observability

**Context:** Cache operations need observability for debugging and monitoring.

**Options considered:**

1. **Effect PubSub (Chosen):**
   - Pros: Opt-in (zero overhead when no subscribers), type-safe event schema,
     composes with Effect's streaming model
   - Cons: Requires consumers to subscribe explicitly
   - Why chosen: Zero-cost when unused, fully typed, and integrates naturally
     with Effect's concurrency model.

2. **Logger/Span tracing:**
   - Pros: Automatic capture without explicit subscription
   - Cons: Always-on overhead, less structured
   - Why rejected: Cache events are high-frequency; always-on logging would
     be noisy.

### Design Patterns Used

#### Pattern 1: Service/Layer separation

- **Where used:** Every service (XdgResolver, AppDirs, ConfigFile,
  JsonSchemaExporter, SqliteCache, SqliteState)
- **Why used:** Separates the interface (what a service does) from the
  implementation (how it does it). Enables testing with alternate
  implementations.
- **Implementation:** Each service has a `services/Foo.ts` file defining the
  `Context.Tag` and interface, and a `layers/FooLive.ts` file providing the
  production implementation via `Layer.effect` or `Layer.succeed`.

#### Pattern 2: Factory functions for parameterized layers

- **Where used:** `AppDirsLive(config)`, `makeConfigFileLive(options)`,
  `makeSqliteCacheLive()`, `makeSqliteStateLive({ migrations })`
- **Why used:** Layers that need configuration at construction time cannot be
  static constants. Factory functions accept config and return typed layers.
- **Implementation:** Each factory returns
  `Layer.Layer<Service, never, Requirements>` with requirements visible in
  the type signature.

#### Pattern 3: Aggregate layers for progressive adoption

- **Where used:** `XdgLive`, `XdgConfigLive`, `XdgFullLive`
- **Why used:** Consumers should not need to manually wire 6 layers. Aggregate
  layers provide pre-composed stacks at natural adoption boundaries.
- **Implementation:** `Layer.mergeAll` composes multiple layers, with
  `Layer.provide` for internal dependencies (e.g., `AppDirsLive` depends on
  `XdgResolverLive`).

#### Pattern 4: Error-absorbing resolvers

- **Where used:** All `ConfigResolver` implementations
- **Why used:** A resolver that fails (e.g., permission denied) should not
  abort the entire config loading pipeline. Missing files are expected.
- **Implementation:** Every resolver wraps its logic in
  `Effect.catchAll(() => Effect.succeed(Option.none()))`, converting all errors
  to "not found".

### Constraints and Trade-offs

#### Constraint: Effect ecosystem alignment

- **Description:** The library must work within Effect's dependency injection
  model and use Effect-native patterns throughout.
- **Impact:** Every external dependency (filesystem, SQL, environment) must be
  accessed through an Effect service, increasing boilerplate compared to
  direct Node.js APIs.
- **Mitigation:** Aggregate layers reduce boilerplate for consumers. The
  factory-function pattern keeps the API surface manageable.

#### Trade-off: Runtime dependency on smol-toml

- **What we gained:** TOML config file support out of the box
- **What we sacrificed:** One bundled runtime dependency (all others are peers)
- **Why it is worth it:** TOML is the natural format for CLI tool configuration
  (used by Cargo, Python pyproject, etc.). smol-toml is small (~15KB) and
  zero-dependency.

#### Trade-off: Optional peer dependencies for SQL and validation layers

- **What we gained:** Consumers who only need path resolution or config files
  do not need to install `@effect/sql`, `@effect/sql-sqlite-node`, or `ajv`
- **What we sacrificed:** More complex dependency setup for consumers using the
  full stack or JSON Schema validation
- **Why it is worth it:** The library serves multiple audiences: lightweight
  XDG path users, config file managers, JSON Schema generators, and full-stack
  state management users. Forcing SQLite or Ajv on everyone would be
  inappropriate. `ajv` is only needed for `JsonSchemaValidator`.

---

## System Architecture

### Layered Architecture

The library follows a strict bottom-up dependency model. Higher layers depend
on lower ones, never the reverse.

#### Layer 1: Environment Resolution (XdgResolver)

**Responsibilities:**

- Read XDG environment variables via `Config`
- Validate that `HOME` is set
- Bundle all paths into `XdgPaths` schema

**Components:** `XdgResolver` service, `XdgResolverLive` layer

**Communication:** Pure data -- returns `Option<string>` or `XdgPaths` values.
No side effects beyond reading the `ConfigProvider`.

#### Layer 2: Application Directories (AppDirs)

**Responsibilities:**

- Apply 4-level precedence to resolve concrete paths
- Create directories on demand via `ensure`

**Components:** `AppDirs` service, `AppDirsLive` layer, `AppDirsConfig` schema,
`ResolvedAppDirs` schema

**Communication:** Depends on XdgResolver for raw path values. Uses FileSystem
for directory creation in `ensure`.

#### Layer 3: Config File Management (ConfigFile)

**Responsibilities:**

- Orchestrate resolvers to discover config files
- Parse, validate, and merge config sources
- Write config files back to disk

**Components:** `ConfigFileService<A>`, `makeConfigFileLive`, `ConfigCodec`,
`ConfigResolver`, `ConfigWalkStrategy`

**Communication:** Uses FileSystem for file I/O. Resolver chain runs
sequentially; strategy receives all discovered sources for resolution.

#### Layer 4: JSON Schema Export (JsonSchemaExporter)

**Responsibilities:**

- Generate JSON Schema from Effect Schema
- Clean schema artifacts (unknown $id, empty required/properties)
- Inject `$id` for SchemaStore compatibility
- Diff and write schema files

**Components:** `JsonSchemaExporter` service, `JsonSchemaExporterLive` layer,
`cleanSchema` internal pass

**Communication:** Standalone build-time service. Uses FileSystem for file I/O.
Not part of the aggregate layer chain (used independently).

#### Layer 4b: JSON Schema Validation (JsonSchemaValidator)

**Responsibilities:**

- Validate generated JSON Schema against Ajv
- Strict-mode checks for missing `additionalProperties` (Tombi compat)

**Components:** `JsonSchemaValidator` service, `JsonSchemaValidatorLive` layer

**Communication:** Standalone build/CI service. Dynamically imports `ajv` (no
FileSystem requirement). Typically chained after `JsonSchemaExporter.generate`.

#### Layer 5: Cache (SqliteCache)

**Responsibilities:**

- Key/value storage with TTL and tags
- Observability via PubSub

**Components:** `SqliteCache` service, `makeSqliteCacheLive`, `CacheEntry`
schema, `CacheEvent` schema

**Communication:** Uses SqlClient for all database operations. Self-contained
-- does not depend on other xdg-effect services (only SqlClient).

#### Layer 6: State (SqliteState)

**Responsibilities:**

- Migration management (up/down)
- Expose raw SqlClient for custom queries

**Components:** `SqliteState` service, `makeSqliteStateLive`,
`MigrationStatus` schema

**Communication:** Uses SqlClient for all database operations. Self-contained
-- does not depend on other xdg-effect services (only SqlClient).

### Component Interactions

#### Interaction 1: Config file loading pipeline

**Participants:** ConfigFileLive, ConfigResolver chain, ConfigCodec,
ConfigWalkStrategy

**Flow:**

1. `load` calls `discoverSources` which iterates over the resolver array
2. Each resolver's `resolve` effect runs, returning `Option<path>`
3. For each found path, the codec `parse`s the raw file content
4. The parsed value is validated against the Effect Schema
5. All discovered `ConfigSource<A>` entries are passed to the strategy
6. The strategy (`FirstMatch` or `LayeredMerge`) produces the final value

```text
Resolver[0]    Resolver[1]    Resolver[N]
  |               |               |
  v               v               v
Option<path>   Option<path>   Option<path>
  |               |               |
  v               v               v
FileSystem.readFileString   (for each Some)
  |               |
  v               v
Codec.parse     Codec.parse
  |               |
  v               v
Schema.decode   Schema.decode
  |               |
  +-------+-------+
          |
          v
   Strategy.resolve([sources])
          |
          v
   Final config value A
```

#### Interaction 2: AppDirs resolution with XdgResolver

**Participants:** AppDirsLive, XdgResolverLive

**Flow:**

1. AppDirsLive obtains XdgResolver from the context
2. Reads `home` and all optional XDG paths
3. For each directory type (config, data, cache, state), applies precedence:
   - Check explicit override from `AppDirsConfig.dirs`
   - Check XDG env value + namespace
   - Check fallbackDir
   - Default to `$HOME/.namespace`
4. Returns `ResolvedAppDirs` with concrete path strings

```text
AppDirsConfig                  XdgResolver
  |                               |
  v                               v
namespace, fallbackDir,     home, configHome,
dirs (overrides)            dataHome, cacheHome, ...
  |                               |
  +---------------+---------------+
                  |
                  v
           resolveDir() x 4
           (precedence logic)
                  |
                  v
           ResolvedAppDirs
```

### Error Handling Strategy

All errors are `Data.TaggedError` subclasses, enabling pattern matching via
`Effect.catchTag`:

- **XdgError** propagates from XdgResolver when HOME is missing
- **AppDirsError** wraps XdgError or filesystem failures during directory
  resolution
- **ConfigError** carries the operation (read/parse/validate/encode/write) and
  file path for precise diagnostics
- **CodecError** wraps parse/stringify failures from JSON or TOML codecs
- **JsonSchemaValidationError** carries the schema `name` and an `errors` array
  of human-readable validation issue descriptions
- **CacheError** and **StateError** carry operation name and optional key for
  SQL-layer failures

Defects (unexpected throws from SQL drivers) are caught via
`Effect.catchAllDefect` and wrapped into the appropriate tagged error type.

---

## Data Flow

### Data Model

Key data structures and their relationships:

```typescript
// Input: consumer provides this to configure AppDirs
class AppDirsConfig {
  namespace: string;
  fallbackDir: Option<string>;
  dirs: Option<{
    config: Option<string>;
    data: Option<string>;
    cache: Option<string>;
    state: Option<string>;
    runtime: Option<string>;
  }>;
}

// Output: resolved from environment + config
class XdgPaths {
  home: string;
  configHome: Option<string>;
  dataHome: Option<string>;
  cacheHome: Option<string>;
  stateHome: Option<string>;
  runtimeDir: Option<string>;
}

// Output: concrete directory paths
class ResolvedAppDirs {
  config: string;
  data: string;
  cache: string;
  state: string;
  runtime: Option<string>;
}
```

### Data Flow Diagrams

#### Flow 1: Environment to directories

```text
[Environment Variables]
  HOME, XDG_CONFIG_HOME, XDG_DATA_HOME, ...
        |
        v
[XdgResolverLive]
  Config.string() -> Option<string>
        |
        v
[XdgPaths]
        |
        v
[AppDirsLive(AppDirsConfig)]
  4-level precedence resolution
        |
        v
[ResolvedAppDirs]
  config: "/home/user/.config/myapp"
  data:   "/home/user/.local/share/myapp"
  cache:  "/home/user/.cache/myapp"
  state:  "/home/user/.local/state/myapp"
```

#### Flow 2: Config file discovery and loading

```text
[Resolver Chain: ExplicitPath -> XdgConfig -> UpwardWalk -> WorkspaceRoot]
        |
   (for each resolver)
        v
[FileSystem.exists(path)]
        |
   (if found)
        v
[FileSystem.readFileString(path)]
        |
        v
[ConfigCodec.parse(raw)]
  JsonCodec or TomlCodec
        |
        v
[Schema.decodeUnknown(schema)(parsed)]
        |
        v
[ConfigSource { path, tier, value }]
        |
   (after all resolvers)
        v
[ConfigWalkStrategy.resolve(sources)]
  FirstMatch: return sources[0].value
  LayeredMerge: deepMerge(sources, priority order)
        |
        v
[Final Config Value: A]
```

#### Flow 3: Cache get with TTL check

```text
[SqliteCache.get(key)]
        |
        v
[SQL: SELECT ... WHERE key = ?]
        |
   (no rows)           (rows found)
        |                    |
        v                    v
  emit(Miss)         [Check expires_at]
  return None()            |
                  (expired)        (valid)
                      |                |
                      v                v
              [SQL: DELETE]      [Build CacheEntry]
              emit(Expired)      emit(Hit)
              emit(Miss)         return Some(entry)
              return None()
```

### State Management

- **XdgResolver:** Stateless -- reads environment on every call
- **AppDirs:** Stateless -- computes paths on every call from resolver + config
- **ConfigFile:** Stateless -- reads filesystem on every call
- **SqliteCache:** Stateful via SQLite `cache_entries` table. PubSub is an
  in-memory unbounded queue created at layer construction time.
- **SqliteState:** Stateful via SQLite `_xdg_migrations` table and
  user-defined migration tables. Migrations run automatically on construction.

---

## Integration Points

### Internal Integrations

#### Integration: Effect ConfigProvider

**How it integrates:** `XdgResolverLive` reads environment variables through
`Config.string()`, which delegates to the ambient `ConfigProvider`. In
production this reads `process.env`; in tests it can be swapped to
`ConfigProvider.fromMap()`.

**Data exchange:** String environment variable values.

#### Integration: @effect/platform FileSystem

**How it integrates:** AppDirs, ConfigFile, and JsonSchemaExporter all
require `FileSystem.FileSystem` in their layer types. Consumers provide
`NodeFileSystem.layer` from `@effect/platform-node` (or a future Bun/Deno
equivalent).

**Data exchange:** File content as strings, directory existence checks, file
writes.

#### Integration: @effect/sql SqlClient

**How it integrates:** SqliteCache and SqliteState require
`SqlClient.SqlClient` in their layer types. Consumers provide
`SqliteLive(filename)` from `@effect/sql-sqlite-node`.

**Data exchange:** SQL queries via tagged template literals. Results as row
arrays.

### External Integrations

#### Integration: smol-toml

**Purpose:** Parse and stringify TOML configuration files.

**Protocol:** Direct function calls (`parse()`, `stringify()`)

**Error handling:** Parse errors are caught and wrapped in `CodecError`.

#### Integration: Tombi (TOML editor tooling)

**Purpose:** JsonSchemaExporter generates schemas compatible with Tombi's
requirements. The `tombi()` helper builds typed `x-tombi-*` annotations.

**Protocol:** JSON Schema files with `$ref` inlining, `x-tombi-*` annotations,
and `cleanSchema` pass for spec compliance.

**Error handling:** N/A -- file format compatibility, not runtime integration.

#### Integration: Taplo (TOML LSP / formatter)

**Purpose:** The `taplo()` helper builds typed `x-taplo` annotations for
Taplo LSP completions and documentation.

**Protocol:** JSON Schema files with `x-taplo` annotation object.

**Error handling:** N/A -- file format compatibility, not runtime integration.

#### Integration: Ajv (JSON Schema validator)

**Purpose:** `JsonSchemaValidator` uses Ajv in strict mode to validate
generated schemas before publishing or writing to disk.

**Protocol:** Dynamic `import("ajv")` with CJS/ESM interop unwrap.

**Error handling:** Ajv compilation errors and strict-mode warnings are
collected into `JsonSchemaValidationError`.

---

## Testing Strategy

### Architecture Testing

**Component isolation:**

- Each service is tested independently by providing only its required layers
- XdgResolver tests use `ConfigProvider.fromMap()` to supply exact env vars
- AppDirs tests provide XdgResolverLive + NodeFileSystem.layer with controlled
  `ConfigProvider`
- ConfigFile tests create temp directories with known file contents
- SQLite tests create temp directories with ephemeral database files

**Integration testing:**

- Aggregate layers (XdgLive, XdgConfigLive, XdgFullLive) are tested with
  realistic multi-layer compositions
- Config file tests exercise the full resolver -> codec -> schema -> strategy
  pipeline

### Unit Tests

**Location:** `src/index.test.ts` (main test file), `__test__/` directory
(unit and integration tests for JSON Schema features)

**Coverage target:** Not formally specified; tests cover all 7 services.

**What is tested:**

- XdgResolver: reads env vars correctly, returns Option.none for unset vars,
  fails on missing HOME
- AppDirs: 4-level precedence, ensure creates directories, namespace
  formatting
- ConfigFile: JSON and TOML loading, FirstMatch and LayeredMerge strategies,
  write round-trip, discover across multiple resolvers
- JsonSchemaExporter: schema generation, $ref inlining, cleanSchema pass, $id
  injection, deepEqual skip logic, WriteResult discrimination
- JsonSchemaValidator: Ajv compilation, strict-mode additionalProperties
  checks, batch validation
- JsonSchemaClass: $id static, schemaEntry generation, toJson encode,
  validate decode
- Jsonifiable: empty schema output, Ajv strict-mode compatibility
- tombi/taplo: typed annotation helpers, field mapping, custom escape hatch
- Integration tests: full generate -> validate pipeline with Vitest snapshots
- SqliteCache: get/set/invalidate/TTL expiry/tag invalidation/prune, PubSub
  event emission
- SqliteState: migrate/rollback/status, pending migration detection,
  auto-migrate on construction

### Test Patterns

**Effect.runPromise + Layer.provide:**

All tests follow the pattern of building an Effect pipeline, providing the
required layers, and running with `Effect.runPromise`:

```typescript
const result = await Effect.gen(function* () {
  const resolver = yield* XdgResolver;
  return yield* resolver.home;
}).pipe(
  Effect.provide(XdgResolverLive),
  Effect.provide(
    Layer.setConfigProvider(ConfigProvider.fromMap(new Map([["HOME", "/tmp/test"]])))
  ),
  Effect.runPromise,
);
```

**Temp directory cleanup:**

SQLite tests create temporary directories and clean them up after each test
to prevent cross-test contamination.

---

## Future Enhancements

### Phase 1: Short-term

- **Config file watching:** Add an optional `watch` method to ConfigFileService
  that returns a `Stream` of config changes using filesystem polling or native
  watchers.
- **WAL mode for SQLite:** Enable WAL journal mode in SqliteCacheLive and
  SqliteStateLive for better concurrent read performance.

### Phase 2: Medium-term

- **Config migration system:** Add a schema versioning and migration mechanism
  to ConfigFile so config files can be upgraded between versions automatically.
- **Indexed tag column for cache:** Replace the JSON-in-TEXT tags column with a
  separate `cache_tags` junction table for efficient tag-based queries at scale.
- **Bun/Deno platform layers:** Test and document compatibility with
  `@effect/platform-bun` and `@effect/platform-deno` (if available).

### Phase 3: Long-term

- **XDG_DATA_DIRS / XDG_CONFIG_DIRS support:** Implement the multi-path search
  directories from the XDG specification (colon-separated lists of fallback
  directories).
- **Encrypted cache entries:** Optional encryption for cache values using a
  user-provided key, useful for sensitive CLI credentials.

### Potential Refactoring

- **SqliteCacheLive error handling:** The repeated `catchAllDefect` +
  `catchIf` pattern in every method could be extracted into a shared combinator
  to reduce boilerplate.
- **Resolver requirements threading:** Currently resolvers carry their
  requirements as a type parameter `R`, but `ConfigFileOptions.resolvers` uses
  `ConfigResolver<any>`. A more type-safe approach could thread requirements
  through the options type.

---

## Related Documentation

**User-Facing Documentation:**

- `README.md` -- Landing page with install, quick example, progressive adoption
  table, and API reference tables
- `docs/01-getting-started.md` -- Installation, first example, progressive
  adoption guide
- `docs/02-resolving-xdg-paths.md` -- XdgResolver + AppDirs usage
- `docs/03-config-files.md` -- ConfigFile with codecs, resolvers, strategies
- `docs/04-json-schema-generation.md` -- JsonSchemaExporter usage
- `docs/05-json-schema-advanced.md` -- SchemaStore compat, helpers, validator,
  JsonSchemaClass
- `docs/06-sqlite-cache.md` -- SqliteCache with TTL, tags, PubSub
- `docs/07-sqlite-state.md` -- SqliteState with migrations
- `docs/08-building-a-cli.md` -- @effect/cli integration patterns
- `docs/09-testing.md` -- Testing patterns with ConfigProvider and temp dirs
- `docs/10-error-handling.md` -- Tagged error types and recovery strategies
- `docs/11-api-reference.md` -- Complete API surface reference

**Package Documentation:**

- `package.json` -- Package metadata, peer dependencies, publish targets

**External Resources:**

- [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir-spec/latest/)
- [Effect Documentation](https://effect.website/)
- [@effect/platform API](https://github.com/Effect-TS/effect/tree/main/packages/platform)
- [@effect/sql API](https://github.com/Effect-TS/effect/tree/main/packages/sql)
- [smol-toml](https://github.com/nicolo-ribaudo/smol-toml)

---

**Document Status:** Current at 80% completeness. All major sections are
populated from the actual implementation. Synced with `feat/schemastore-compat`
branch additions (JsonSchemaValidator, JsonSchemaClass, Jsonifiable, tombi/taplo
helpers, cleanSchema pass, $id support). Sections that could benefit from
additional detail: per-test coverage breakdown, performance characteristics
of SQLite operations, and cross-references to the user-facing docs for
usage examples (the guides in `docs/` now cover aggregate layer usage
extensively).

**Next Steps:**

- Add performance design doc covering SQLite tuning and cache efficiency
- Add observability design doc covering PubSub event patterns and monitoring
- Create implementation plan for config file watching feature
