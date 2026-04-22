# xdg-effect

[![npm version](https://img.shields.io/npm/v/xdg-effect)](https://www.npmjs.com/package/xdg-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript 6.0](https://img.shields.io/badge/TypeScript-6.0-3178c6)](https://www.typescriptlang.org/)
[![Effect](https://img.shields.io/badge/Effect-3.21+-black)](https://effect.website/)

Opinionated [Effect](https://effect.website/) library for XDG Base Directory support — from environment variable resolution through config file management to SQLite-backed caching and persistent state.

## What is xdg-effect?

xdg-effect is an opinionated [Effect](https://effect.website/) library that brings full [XDG Base Directory](https://specifications.freedesktop.org/basedir-spec/latest/) support to Node.js applications. It covers the complete stack: reading XDG environment variables through Effect's `Config` module, resolving app-namespaced directories with multi-level precedence, loading and merging config files with pluggable codecs and strategies, generating JSON Schema for editor autocompletion, and optionally adding SQLite-backed key/value caching and managed state. Every capability is packaged as a composable `Layer`, so you adopt only what your application needs.

## Features

- **XdgResolver** — Read XDG environment variables through Effect's `Config` module with typed fallbacks
- **AppDirs** — Resolve app-namespaced directories with 4-level precedence (explicit, XDG, fallback directory, home fallback)
- **ConfigFile** — Load and merge config files with pluggable codecs, resolvers, and strategies
- **JsonSchemaExporter** — Generate JSON Schema from Effect Schema for editor autocompletion (with Tombi/Taplo annotation support)
- **JsonSchemaValidator** — Validate generated schemas with Ajv strict mode for SchemaStore/Tombi compatibility
- **SqliteCache** — Key/value cache with TTL, tag-based invalidation, and PubSub observability
- **SqliteState** — Managed SQLite database with migration tracking

## Quick Example

```typescript
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import {
  AppDirsConfig,
  ConfigFile,
  TomlCodec,
  FirstMatch,
  XdgConfig,
  UpwardWalk,
  XdgConfigLive,
} from "xdg-effect";

// 1. Define your config schema
const MyConfig = Schema.Struct({
  name: Schema.String,
  port: Schema.Number,
  debug: Schema.optional(Schema.Boolean, { default: () => false }),
});
type MyConfig = typeof MyConfig.Type;

// 2. Create a typed service tag
const MyConfigFile = ConfigFile.Tag<MyConfig>("my-tool/Config");

// 3. Compose layers
const layer = XdgConfigLive({
  app: new AppDirsConfig({ namespace: "my-tool" }),
  config: {
    tag: MyConfigFile,
    schema: MyConfig,
    codec: TomlCodec,
    strategy: FirstMatch,
    resolvers: [
      UpwardWalk({ filename: "my-tool.config.toml" }),
      XdgConfig({ filename: "config.toml" }),
    ],
  },
});

// 4. Load config
const program = Effect.gen(function* () {
  const config = yield* MyConfigFile;
  const value = yield* config.load;
  console.log(value);
});

Effect.runPromise(
  program.pipe(Effect.provide(layer), Effect.provide(NodeFileSystem.layer)),
);
```

## Install

```bash
pnpm add xdg-effect effect @effect/platform @effect/platform-node
```

For `SqliteCache` and `SqliteState`, also install the optional peer dependencies:

```bash
pnpm add @effect/sql @effect/sql-sqlite-node
```

For `JsonSchemaValidator`, also install the optional peer dependency:

```bash
pnpm add ajv
```

## Progressive Adoption

| Layer | Services Provided | Requirements | Use When |
| ----- | ----------------- | ------------ | -------- |
| `XdgResolver.Live` | `XdgResolver` | (none) | You only need raw XDG env vars |
| `XdgLive(config)` | `XdgResolver`, `AppDirs` | `FileSystem` | You need app-namespaced directories |
| `XdgConfigLive(options)` | `XdgResolver`, `AppDirs`, `ConfigFile` | `FileSystem` | You need config file loading |
| `XdgFullLive(options)` | `XdgResolver`, `AppDirs`, `ConfigFile`, `SqliteCache`, `SqliteState` | `FileSystem`, `SqlClient` | You need the full stack |

## Documentation

1. [Getting Started](./docs/01-getting-started.md)
2. [Resolving XDG Paths](./docs/02-resolving-xdg-paths.md)
3. [Config Files](./docs/03-config-files.md)
4. [JSON Schema Generation](./docs/04-json-schema-generation.md)
5. [JSON Schema Advanced](./docs/05-json-schema-advanced.md)
6. [SQLite Cache](./docs/06-sqlite-cache.md)
7. [SQLite State](./docs/07-sqlite-state.md)
8. [Building a CLI](./docs/08-building-a-cli.md)
9. [Testing](./docs/09-testing.md)
10. [Error Handling](./docs/10-error-handling.md)
11. [API Reference](./docs/11-api-reference.md)

## API at a Glance

### Services

| Export | Kind | Guide |
| ------ | ---- | ----- |
| [`XdgResolver`](./docs/02-resolving-xdg-paths.md) | `Context.Tag` | Resolving XDG Paths |
| [`AppDirs`](./docs/02-resolving-xdg-paths.md) | `Context.Tag` | Resolving XDG Paths |
| [`ConfigFile.Tag`](./docs/03-config-files.md) | factory | Config Files |
| [`JsonSchemaExporter`](./docs/04-json-schema-generation.md) | `Context.Tag` | JSON Schema Generation |
| [`JsonSchemaValidator`](./docs/05-json-schema-advanced.md) | `Context.Tag` | JSON Schema Advanced |
| [`SqliteCache`](./docs/06-sqlite-cache.md) | `Context.Tag` | SQLite Cache |
| [`SqliteState`](./docs/07-sqlite-state.md) | `Context.Tag` | SQLite State |

### Layers

| Export | Kind | Guide |
| ------ | ---- | ----- |
| [`XdgResolver.Live`](./docs/02-resolving-xdg-paths.md) | `Layer` | Resolving XDG Paths |
| [`AppDirs.Live`](./docs/02-resolving-xdg-paths.md) | `Layer` | Resolving XDG Paths |
| [`XdgLive`](./docs/02-resolving-xdg-paths.md) | `Layer` | Resolving XDG Paths |
| [`ConfigFile.Live`](./docs/03-config-files.md) | factory | Config Files |
| [`XdgConfigLive`](./docs/03-config-files.md) | function | Config Files |
| [`JsonSchemaExporter.Live`](./docs/04-json-schema-generation.md) | `Layer` | JSON Schema Generation |
| [`JsonSchemaValidator.Live`](./docs/05-json-schema-advanced.md) | `Layer` | JSON Schema Advanced |
| [`SqliteCache.Live`](./docs/06-sqlite-cache.md) | factory | SQLite Cache |
| [`SqliteState.Live`](./docs/07-sqlite-state.md) | factory | SQLite State |
| [`XdgFullLive`](./docs/01-getting-started.md) | function | Getting Started |

### Codecs

| Export | Kind | Guide |
| ------ | ---- | ----- |
| [`JsonCodec`](./docs/03-config-files.md) | `ConfigCodec` | Config Files |
| [`TomlCodec`](./docs/03-config-files.md) | `ConfigCodec` | Config Files |

### Resolvers

| Export | Kind | Guide |
| ------ | ---- | ----- |
| [`ExplicitPath`](./docs/03-config-files.md) | `ConfigResolver` | Config Files |
| [`StaticDir`](./docs/03-config-files.md) | `ConfigResolver` | Config Files |
| [`UpwardWalk`](./docs/03-config-files.md) | `ConfigResolver` | Config Files |
| [`WorkspaceRoot`](./docs/03-config-files.md) | `ConfigResolver` | Config Files |
| [`XdgConfig`](./docs/03-config-files.md) | `ConfigResolver` | Config Files |
| [`XdgSavePath`](./docs/03-config-files.md) | helper | Config Files |

### Strategies

| Export | Kind | Guide |
| ------ | ---- | ----- |
| [`FirstMatch`](./docs/03-config-files.md) | `ConfigWalkStrategy` | Config Files |
| [`LayeredMerge`](./docs/03-config-files.md) | `ConfigWalkStrategy` | Config Files |

### Schemas

| Export | Kind | Guide |
| ------ | ---- | ----- |
| [`AppDirsConfig`](./docs/02-resolving-xdg-paths.md) | `Schema.Class` | Resolving XDG Paths |
| [`XdgPaths`](./docs/02-resolving-xdg-paths.md) | `Schema.Class` | Resolving XDG Paths |
| [`ResolvedAppDirs`](./docs/02-resolving-xdg-paths.md) | `Schema.Class` | Resolving XDG Paths |
| [`Jsonifiable`](./docs/04-json-schema-generation.md) | `Schema` | JSON Schema Generation |
| [`JsonSchemaClass`](./docs/05-json-schema-advanced.md) | factory | JSON Schema Advanced |
| [`CacheEntry`](./docs/06-sqlite-cache.md) | `Schema.Class` | SQLite Cache |
| [`CacheEvent`](./docs/06-sqlite-cache.md) | `Schema.Class` | SQLite Cache |
| [`CacheEventPayload`](./docs/06-sqlite-cache.md) | `Schema.Class` | SQLite Cache |
| [`MigrationStatus`](./docs/07-sqlite-state.md) | `Schema.Class` | SQLite State |
| [`Written`](./docs/04-json-schema-generation.md) | function | JSON Schema Generation |
| [`Unchanged`](./docs/04-json-schema-generation.md) | function | JSON Schema Generation |

### Helpers

| Export | Kind | Guide |
| ------ | ---- | ----- |
| [`tombi`](./docs/05-json-schema-advanced.md) | function | JSON Schema Advanced |
| [`taplo`](./docs/05-json-schema-advanced.md) | function | JSON Schema Advanced |

### Errors

| Export | Kind | Guide |
| ------ | ---- | ----- |
| [`XdgError`](./docs/10-error-handling.md) | `TaggedError` | Error Handling |
| [`AppDirsError`](./docs/10-error-handling.md) | `TaggedError` | Error Handling |
| [`ConfigError`](./docs/10-error-handling.md) | `TaggedError` | Error Handling |
| [`CodecError`](./docs/10-error-handling.md) | `TaggedError` | Error Handling |
| [`JsonSchemaError`](./docs/10-error-handling.md) | `TaggedError` | Error Handling |
| [`JsonSchemaValidationError`](./docs/05-json-schema-advanced.md) | `TaggedError` | JSON Schema Advanced |
| [`CacheError`](./docs/10-error-handling.md) | `TaggedError` | Error Handling |
| [`StateError`](./docs/10-error-handling.md) | `TaggedError` | Error Handling |

### Types

| Export | Kind | Guide |
| ------ | ---- | ----- |
| [`XdgEffectError`](./docs/10-error-handling.md) | type | Error Handling |
| [`ConfigCodec`](./docs/03-config-files.md) | type | Config Files |
| [`ConfigResolver`](./docs/03-config-files.md) | type | Config Files |
| [`ConfigWalkStrategy`](./docs/03-config-files.md) | type | Config Files |
| [`ConfigSource`](./docs/03-config-files.md) | type | Config Files |
| [`ConfigFileService`](./docs/03-config-files.md) | type | Config Files |
| [`ConfigFileOptions`](./docs/03-config-files.md) | type | Config Files |
| [`ConfigFileTestOptions`](./docs/09-testing.md) | type | Testing |
| [`XdgConfigLiveOptions`](./docs/03-config-files.md) | type | Config Files |
| [`XdgFullLiveOptions`](./docs/01-getting-started.md) | type | Getting Started |
| [`XdgResolverTestOptions`](./docs/09-testing.md) | type | Testing |
| [`AppDirsService`](./docs/02-resolving-xdg-paths.md) | type | Resolving XDG Paths |
| [`XdgResolverService`](./docs/02-resolving-xdg-paths.md) | type | Resolving XDG Paths |
| [`JsonSchemaExporterService`](./docs/04-json-schema-generation.md) | type | JSON Schema Generation |
| [`JsonSchemaValidatorService`](./docs/05-json-schema-advanced.md) | type | JSON Schema Advanced |
| [`ValidatorOptions`](./docs/05-json-schema-advanced.md) | type | JSON Schema Advanced |
| [`JsonSchemaClassStatics`](./docs/05-json-schema-advanced.md) | type | JSON Schema Advanced |
| [`JsonSchemaOutput`](./docs/04-json-schema-generation.md) | type | JSON Schema Generation |
| [`SchemaEntry`](./docs/04-json-schema-generation.md) | type | JSON Schema Generation |
| [`TombiOptions`](./docs/05-json-schema-advanced.md) | type | JSON Schema Advanced |
| [`TaploOptions`](./docs/05-json-schema-advanced.md) | type | JSON Schema Advanced |
| [`SqliteCacheService`](./docs/06-sqlite-cache.md) | type | SQLite Cache |
| [`CacheEntryMeta`](./docs/06-sqlite-cache.md) | type | SQLite Cache |
| [`PruneResult`](./docs/06-sqlite-cache.md) | type | SQLite Cache |
| [`SqliteStateService`](./docs/07-sqlite-state.md) | type | SQLite State |
| [`StateMigration`](./docs/07-sqlite-state.md) | type | SQLite State |
| [`MigrationResult`](./docs/07-sqlite-state.md) | type | SQLite State |
| [`WriteResult`](./docs/04-json-schema-generation.md) | type | JSON Schema Generation |

## License

[MIT](LICENSE)
