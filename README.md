# xdg-effect

[![npm version](https://img.shields.io/npm/v/xdg-effect)](https://www.npmjs.com/package/xdg-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript 6.0](https://img.shields.io/badge/TypeScript-6.0-3178c6)](https://www.typescriptlang.org/)
[![Effect](https://img.shields.io/badge/Effect-3.21+-black)](https://effect.website/)

Opinionated [Effect](https://effect.website/) library for XDG Base Directory support — from environment variable resolution through config file management to SQLite-backed caching and persistent state.

## Three-Package Ecosystem

xdg-effect is the composition layer in a three-package ecosystem:

| Package | Purpose |
| ------- | ------- |
| **xdg-effect** | XDG path resolution, app directories, SQLite cache/state, XDG-aware config bridges |
| [config-file-effect](https://github.com/spencerbeggs/config-file-effect) | Config file loading with pluggable codecs, resolvers, strategies, encryption, migrations, watching |
| [json-schema-effect](https://github.com/spencerbeggs/json-schema-effect) | JSON Schema generation, validation, scaffolding, and TOML tooling annotations |

xdg-effect re-exports common items from both sibling packages, so you can import everything from a single entry point or from each package individually.

## Quick Example

```typescript
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { ConfigFile, XdgConfigLive } from "xdg-effect";

const MyConfig = Schema.Struct({
  name: Schema.String,
  port: Schema.Number,
  debug: Schema.optional(Schema.Boolean, { default: () => false }),
});
type MyConfig = typeof MyConfig.Type;

const MyConfigFile = ConfigFile.Tag<MyConfig>("my-tool/Config");

// Preset: TOML codec, UpwardWalk + XdgConfigResolver, FirstMatch strategy
const layer = XdgConfigLive.toml({
  namespace: "my-tool",
  filename: "config.toml",
  tag: MyConfigFile,
  schema: MyConfig,
});

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
npm install xdg-effect config-file-effect effect @effect/platform @effect/platform-node
```

For JSON Schema generation (editor autocompletion, SchemaStore publishing):

```bash
npm install json-schema-effect
```

For SQLite-backed cache and state:

```bash
npm install @effect/sql @effect/sql-sqlite-node
```

## Progressive Adoption

| Layer | Provides | Requires | Use when |
| ----- | -------- | -------- | -------- |
| `XdgResolver.Live` | `XdgResolver` | (none) | You only need raw XDG env vars |
| `XdgLive(config)` | `XdgResolver`, `AppDirs` | `FileSystem` | You need app-namespaced directories |
| `XdgConfigLive(options)` | `XdgResolver`, `AppDirs`, `ConfigFileService` | `FileSystem` | You need config file loading |
| `XdgConfigLive.toml(preset)` | Same as above | `FileSystem` | Common case with less boilerplate |
| `XdgFullLive(options)` | All above + `SqliteCache`, `SqliteState` | `FileSystem`, `SqlClient` | You need the full stack |
| `SqliteCache.XdgLive()` | `SqliteCache` | `AppDirs` | Cache with XDG-managed database path |
| `SqliteState.XdgLive(options)` | `SqliteState` | `AppDirs` | State with XDG-managed database path |

## Features

### XDG Services (this package)

- **XdgResolver** — Read XDG environment variables through Effect's `Config` module
- **AppDirs** — Resolve app-namespaced directories with 4-level precedence
- **XdgConfigResolver** — Resolver that finds config files in XDG directories
- **XdgSavePath** — Helper for saving config files to XDG paths
- **SqliteCache** — Key/value cache with TTL, tag-based invalidation, PubSub events
- **SqliteState** — Managed SQLite with migration tracking

### Config File Loading (via config-file-effect)

- **ConfigFile** — Pluggable config loading with codecs, resolvers, and strategies
- **Codecs** — JSON, TOML, and AES-GCM encrypted
- **Resolvers** — ExplicitPath, StaticDir, UpwardWalk, WorkspaceRoot, GitRoot
- **Strategies** — FirstMatch, LayeredMerge
- **Events** — PubSub observability for config operations
- **Migrations** — Versioned schema transforms for config files
- **Watcher** — File change detection with polling

### JSON Schema Tooling (via json-schema-effect)

- **JsonSchemaExporter** — Generate JSON Schema from Effect Schema
- **JsonSchemaValidator** — Validate with Ajv (strict and Tombi convention modes)
- **JsonSchemaScaffolder** — Generate starter config files from schemas
- **Helpers** — `tombi()` and `taplo()` annotation builders for TOML tooling

## Documentation

1. [Getting Started](./docs/01-getting-started.md)
2. [Resolving XDG Paths](./docs/02-resolving-xdg-paths.md)
3. [XDG Config Files](./docs/03-xdg-config-files.md)
4. [SQLite Cache](./docs/04-sqlite-cache.md)
5. [SQLite State](./docs/05-sqlite-state.md)
6. [Building a CLI](./docs/06-building-a-cli.md)
7. [Testing](./docs/07-testing.md)
8. [Error Handling](./docs/08-error-handling.md)
9. [API Reference](./docs/09-api-reference.md)

## License

[MIT](LICENSE)
