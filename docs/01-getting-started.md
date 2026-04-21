# Getting Started

xdg-effect gives your Effect application XDG Base Directory support through composable layers. This guide covers installation, core concepts, and your first program.

## Prerequisites

- Node.js 20+ (22+ recommended)
- A package manager (pnpm, npm, or yarn)
- Basic TypeScript familiarity (generics, async/await)
- Effect experience is helpful but not required; this guide introduces the concepts you need

## Installation

```bash
pnpm add xdg-effect effect @effect/platform @effect/platform-node
```

For SqliteCache and SqliteState, add the optional SQLite dependencies:

```bash
pnpm add @effect/sql @effect/sql-sqlite-node
```

## Core Concepts

### Effect

> **Effect concept: Effect** — An `Effect<A, E, R>` is a description of a program that produces a value `A`, can fail with error `E`, and requires services `R` to run. Effects are lazy and do nothing until explicitly executed.
> See the [Effect docs](https://effect.website/) for more.

[Effect](https://effect.website/) is a TypeScript library for building type-safe, composable programs. Rather than executing side effects directly, you describe what your program should do and let the Effect runtime handle execution, error propagation, and resource management. The three type parameters tell you everything about a program at a glance: what it returns, what can go wrong, and what it needs.

For example, `Effect<string, XdgError, XdgResolver>` is a program that returns a `string`, may fail with `XdgError`, and requires the `XdgResolver` service. xdg-effect uses this type-level precision throughout — every service method carries exact error and dependency information.

### Services and Context.Tag

> **Effect concept: Service** — A service is a named interface that defines a capability. `Context.Tag` gives each service a unique identity so Effect can look it up in the runtime context.
> See the [Effect docs on Services](https://effect.website/docs/requirements-management/services) for more.

Services define interfaces. `Context.Tag` gives each service a unique identity that Effect uses to resolve it from the current context. You interact with a service by `yield*`-ing its tag inside `Effect.gen`, which extracts the live implementation at runtime.

xdg-effect defines six services: `XdgResolver`, `AppDirs`, `ConfigFile`, `JsonSchemaExporter`, `SqliteCache`, and `SqliteState`. For example, `XdgResolver` is a service with methods like `home` (returns the `HOME` path) and `configHome` (returns the optional `XDG_CONFIG_HOME` path).

### Layers

> **Effect concept: Layer** — A `Layer<A, E, R>` is a recipe for constructing service `A`. It may fail with `E` and may require services `R` as inputs.
> See the [Effect docs on Layers](https://effect.website/docs/requirements-management/layers) for more.

A `Layer<A, E, R>` is a recipe for building a service. Layers are composable: you wire them together with `Layer.mergeAll` and `Layer.provide` to form the full environment your program needs. Because dependencies are tracked in types, the compiler tells you when something is missing.

xdg-effect provides ready-made layers for each service (`XdgResolverLive`, `AppDirsLive`, etc.) and aggregate layers that bundle multiple services (`XdgLive`, `XdgConfigLive`, `XdgFullLive`). You pick the layers your program needs and provide them together.

### Effect.gen and Effect.provide

> **Effect concept: Effect.gen** — `Effect.gen` lets you write effectful code with generator syntax. `yield*` inside a generator extracts values from effects, pausing execution until each effect resolves.
> See the [Effect docs on Effect.gen](https://effect.website/docs/getting-started/using-generators) for more.

`Effect.gen` lets you write effectful code with generator syntax. `yield*` inside a generator extracts values from effects, pausing execution until each effect resolves — similar to `await` in async functions. `Effect.provide` wires services into an effect, satisfying its `R` requirement. `Effect.runPromise` executes the final effect and returns a `Promise`.

## Your First Program

The following program resolves XDG paths and prints them to the console:

```typescript
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Option } from "effect";
import { XdgResolver, XdgResolverLive } from "xdg-effect";

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

Effect.runPromise(program.pipe(Effect.provide(XdgResolverLive)));
```

> **Effect concept: Option** — `Option` is Effect's way of representing a value that might not exist — like `T | null` but type-safe. `Option.isSome(x)` checks if a value is present, and `x.value` extracts it. See the [Effect docs on Option](https://effect.website/docs/data-types/option) for more.

**What to expect:** Running this program on a typical macOS system with `XDG_CONFIG_HOME` set produces output like:

```text
HOME: /Users/alice
XDG_CONFIG_HOME: /Users/alice/.config
All XDG paths: { home: '/Users/alice', configHome: { _tag: 'Some', value: '/Users/alice/.config' }, dataHome: { _tag: 'None' }, cacheHome: { _tag: 'None' }, stateHome: { _tag: 'None' }, runtimeDir: { _tag: 'None' } }
```

If `XDG_CONFIG_HOME` is not set, the `configHome` branch prints `(not set, will use default)` and `configHome` appears as `{ _tag: 'None' }` in the full paths output.

`XdgResolverLive` reads XDG environment variables through Effect's `Config` module. `home` is required and fails with `XdgError` if `HOME` is not set — this is reflected in its type: `Effect<string, XdgError>`. The other paths (`configHome`, `dataHome`, etc.) return `Option<string>` because the XDG environment variables are optional; when unset, the library returns `Option.none()` and your application applies the XDG default path rules itself.

## What's Next

- [Resolving XDG Paths](./02-resolving-xdg-paths.md) — AppDirs service, 4-level precedence, directory creation
- [Config Files](./03-config-files.md) — Codecs, resolvers, strategies, config loading
- [JSON Schema Generation](./04-json-schema-generation.md) — Editor autocompletion for config files
- [SQLite Cache](./05-sqlite-cache.md) — TTL cache with tag invalidation
- [SQLite State](./06-sqlite-state.md) — Managed database with migrations
- [Building a CLI](./07-building-a-cli.md) — @effect/cli integration
- [Testing](./08-testing.md) — Testing patterns with ConfigProvider and in-memory FS
- [Error Handling](./09-error-handling.md) — Typed errors and recovery patterns
- [API Reference](./10-api-reference.md) — Complete export reference

---

[Next: Resolving XDG Paths](./02-resolving-xdg-paths.md)
