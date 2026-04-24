# Getting Started

xdg-effect is part of a three-package ecosystem for building XDG-compliant Effect applications:

| Package | Purpose | Install when you need |
| ------- | ------- | -------------------- |
| **xdg-effect** | XDG path resolution, app-namespaced directories, SQLite cache and state | XDG Base Directory support, persistent storage |
| **config-file-effect** | Config file loading with pluggable codecs, resolvers, and strategies | TOML/JSON config files with multi-source resolution |
| **json-schema-effect** | JSON Schema generation, validation, and TOML tooling annotations | Editor autocompletion for config files, SchemaStore publishing |

Each package is independently useful. xdg-effect depends on config-file-effect and provides XDG-specific bridges into it (`XdgConfigResolver` resolver, `XdgSavePath` helper, `XdgConfigLive` aggregate layer). json-schema-effect is a standalone sibling — install it when you need to generate JSON Schemas from your Effect Schemas.

## Prerequisites

- Node.js 24+
- A package manager (pnpm, npm, or yarn)
- Basic TypeScript familiarity (generics, async/await)
- Effect experience is helpful but not required; this guide introduces the concepts you need

## Installation

Install the packages your application needs:

```bash
# XDG path resolution + config file loading
pnpm add xdg-effect config-file-effect effect @effect/platform @effect/platform-node
```

For JSON Schema generation (build-time tooling for editor autocompletion):

```bash
pnpm add json-schema-effect
```

For SQLite-backed cache and state:

```bash
pnpm add @effect/sql @effect/sql-sqlite-node
```

## Import Pattern

Import from the package that owns each export:

```typescript
// XDG services — from xdg-effect
import { AppDirs, AppDirsConfig, XdgConfigResolver, XdgConfigLive, XdgSavePath, XdgResolver } from "xdg-effect";

// Config file machinery — from config-file-effect
import { ConfigFile, FirstMatch, JsonCodec, TomlCodec, UpwardWalk, ExplicitPath } from "config-file-effect";

// JSON Schema tooling — from json-schema-effect
import { JsonSchemaExporter, JsonSchemaValidator, tombi, taplo } from "json-schema-effect";
```

Or import everything from `xdg-effect` as a single entry point:

```typescript
// All-in-one import — xdg-effect re-exports config-file-effect and json-schema-effect
import {
  AppDirs, AppDirsConfig, XdgConfigLive, XdgConfigResolver, XdgSavePath,
  ConfigFile, TomlCodec, FirstMatch, UpwardWalk,
  JsonSchemaExporter, tombi, taplo,
} from "xdg-effect";
```

## Core Concepts

### Effect

> **Effect concept: Effect** — An `Effect<A, E, R>` is a description of a program that produces a value `A`, can fail with error `E`, and requires services `R` to run. Effects are lazy and do nothing until explicitly executed.
> See the [Effect docs](https://effect.website/) for more.

[Effect](https://effect.website/) is a TypeScript library for building type-safe, composable programs. The three type parameters tell you everything about a program at a glance: what it returns, what can go wrong, and what it needs.

### Services and Context.Tag

> **Effect concept: Service** — A service is a named interface that defines a capability. `Context.Tag` gives each service a unique identity so Effect can look it up in the runtime context.
> See the [Effect docs on Services](https://effect.website/docs/requirements-management/services) for more.

Services define interfaces. You interact with a service by `yield*`-ing its tag inside `Effect.gen`, which extracts the live implementation at runtime.

xdg-effect provides four services: `XdgResolver`, `AppDirs`, `SqliteCache`, and `SqliteState`. Config file services come from config-file-effect (`ConfigFile`), and JSON Schema services from json-schema-effect (`JsonSchemaExporter`, `JsonSchemaValidator`).

### Layers

> **Effect concept: Layer** — A `Layer<A, E, R>` is a recipe for constructing service `A`. It may fail with `E` and may require services `R` as inputs.
> See the [Effect docs on Layers](https://effect.website/docs/requirements-management/layers) for more.

A `Layer<A, E, R>` is a recipe for building a service. Layers are composable: wire them together with `Layer.mergeAll` and `Layer.provide` to form the full environment your program needs. Layer factories are statics on their service tags — for example, `XdgResolver.Live` rather than a standalone export.

xdg-effect provides aggregate layers that bundle multiple services:

| Layer | Provides | Requires |
| ----- | -------- | -------- |
| `XdgLive(config)` | `XdgResolver` + `AppDirs` | `FileSystem` |
| `XdgConfigLive(options)` | `XdgResolver` + `AppDirs` + `ConfigFileService<A>` | `FileSystem` |
| `XdgFullLive(options)` | All of the above + `SqliteCache` + `SqliteState` | `FileSystem` + `SqlClient` |

## Your First Program

The following program resolves XDG paths and prints them to the console:

```typescript
import { Effect, Option } from "effect";
import { XdgResolver } from "xdg-effect";

const program = Effect.gen(function* () {
  const resolver = yield* XdgResolver;

  const home = yield* resolver.home;
  console.log("HOME:", home);

  const configHome = yield* resolver.configHome;
  if (Option.isSome(configHome)) {
    console.log("XDG_CONFIG_HOME:", configHome.value);
  } else {
    console.log("XDG_CONFIG_HOME: (not set, will use default)");
  }

  const paths = yield* resolver.resolveAll;
  console.log("All XDG paths:", paths);
});

Effect.runPromise(program.pipe(Effect.provide(XdgResolver.Live)));
```

## What's Next

- [Resolving XDG Paths](./02-resolving-xdg-paths.md) — AppDirs service, 4-level precedence, directory creation
- [XDG Config Files](./03-xdg-config-files.md) — XdgConfigResolver resolver, XdgSavePath, XdgConfigLive
- [SQLite Cache](./04-sqlite-cache.md) — TTL cache with tag invalidation
- [SQLite State](./05-sqlite-state.md) — Managed database with migrations
- [Building a CLI](./06-building-a-cli.md) — Three-package integration with @effect/cli
- [Testing](./07-testing.md) — Test layers and ConfigProvider patterns
- [Error Handling](./08-error-handling.md) — Typed errors and recovery
- [API Reference](./09-api-reference.md) — Complete export reference

---

[Next: Resolving XDG Paths](./02-resolving-xdg-paths.md)
