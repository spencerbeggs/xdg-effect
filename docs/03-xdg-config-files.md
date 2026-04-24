# XDG Config Files

xdg-effect bridges into [config-file-effect](https://github.com/spencerbeggs/config-file-effect) with two XDG-specific components and an aggregate layer that wires everything together.

## The Pieces

| Export | Package | Purpose |
| ------ | ------- | ------- |
| `ConfigFile`, `TomlCodec`, `FirstMatch`, `UpwardWalk`, etc. | config-file-effect | Generic config file loading |
| `XdgConfigResolver` | xdg-effect | Resolver that looks for files in the XDG config directory |
| `XdgSavePath` | xdg-effect | Helper that resolves the default save path in the XDG config directory |
| `XdgConfigLive` | xdg-effect | Aggregate layer composing `XdgLive` + `ConfigFile.Live` |

You import the generic machinery from config-file-effect and the XDG bridges from xdg-effect. `XdgConfigLive` composes them into a single layer.

## XdgConfigResolver Resolver

`XdgConfigResolver` is a `ConfigResolver` that uses the `AppDirs` service to locate a file in the user's XDG config directory:

```typescript
import { XdgConfigResolver } from "xdg-effect";

const resolver = XdgConfigResolver({ filename: "config.toml" });
// Looks for: ~/.config/<namespace>/config.toml
```

It resolves the XDG config directory from `AppDirs`, appends the filename, and checks if the file exists. Returns `Option.some(path)` when found, `Option.none()` otherwise. Filesystem and AppDirs errors are caught and treated as "not found".

The resolver's Effect requirement is `FileSystem | AppDirs`, which means it must be provided alongside an `XdgLive` or `XdgConfigLive` layer that supplies `AppDirs`.

## XdgSavePath Helper

`XdgSavePath` resolves the default save path for config files in the XDG directory. Use it as the `defaultPath` option in `ConfigFileOptions` to enable the `save()` and `update()` methods:

```typescript
import { XdgSavePath } from "xdg-effect";

const defaultPath = XdgSavePath("config.toml");
// Resolves to: ~/.config/<namespace>/config.toml
```

It requires `AppDirs` in its Effect context, which `XdgConfigLive` satisfies automatically.

## XdgConfigLive

`XdgConfigLive` is an aggregate layer that composes `XdgLive` (which provides `XdgResolver` + `AppDirs`) with `ConfigFile.Live` from config-file-effect:

```typescript
XdgConfigLive<A>(options: {
  app: AppDirsConfig;
  config: ConfigFileOptions<A>;
}): Layer<XdgResolver | AppDirs | ConfigFileService<A>, never, FileSystem>
```

It requires `FileSystem` from `@effect/platform`, which you satisfy with `NodeFileSystem.layer`.

## Complete Example

The following program loads a TOML config file using a resolver chain that checks the local directory first, then the XDG global location:

```typescript
import { NodeFileSystem } from "@effect/platform-node";
import { ConfigFile, FirstMatch, TomlCodec, UpwardWalk } from "config-file-effect";
import { Effect, Schema } from "effect";
import { AppDirsConfig, XdgConfigResolver, XdgConfigLive, XdgSavePath } from "xdg-effect";

// Define your config schema
const MyConfig = Schema.Struct({
  name: Schema.String,
  port: Schema.optional(Schema.Number, { default: () => 3000 }),
});
type MyConfig = typeof MyConfig.Type;

// Create a tagged config service
const MyConfigFile = ConfigFile.Tag<MyConfig>("my-tool/Config");

// Build the layer
const layer = XdgConfigLive({
  app: new AppDirsConfig({ namespace: "my-tool" }),
  config: {
    tag: MyConfigFile,
    schema: MyConfig,
    codec: TomlCodec,
    strategy: FirstMatch,
    resolvers: [
      UpwardWalk({ filename: "my-tool.config.toml" }),
      XdgConfigResolver({ filename: "config.toml" }),
    ],
    defaultPath: XdgSavePath("config.toml"),
  },
});

// Use the config
const program = Effect.gen(function* () {
  const configFile = yield* MyConfigFile;

  // Load config (first match wins)
  const config = yield* configFile.load;
  console.log(`${config.name} on port ${config.port}`);

  // Save updated config to XDG directory
  yield* configFile.save({ name: config.name, port: 8080 });
});

Effect.runPromise(
  program.pipe(
    Effect.provide(layer),
    Effect.provide(NodeFileSystem.layer),
  ),
);
```

### Preset Alternative

For the common case, `XdgConfigLive.toml()` encodes the same resolver chain with fewer parameters:

```typescript
const layer = XdgConfigLive.toml({
  namespace: "my-tool",
  filename: "config.toml",
  tag: MyConfigFile,
  schema: MyConfig,
});
```

This is equivalent to the full form above: UpwardWalk + XdgConfigResolver resolvers, FirstMatch strategy, XdgSavePath for defaultPath, TomlCodec. Use `XdgConfigLive.json()` for JSON config files.

### Resolver Precedence

The resolver chain in the example creates a natural priority order:

1. **`UpwardWalk`** — walks up from `process.cwd()` looking for `my-tool.config.toml`. This catches project-local config files
2. **`XdgConfigResolver`** — falls back to `~/.config/my-tool/config.toml` (the global user config)

When the user runs `save()`, the config is written to the XDG location via `XdgSavePath`.

## Validation

config-file-effect supports two forms of validation that run after Effect Schema decoding.

### The validate callback

Pass a `validate` function in `ConfigFileOptions` to add semantic validation beyond what the schema enforces. The callback receives the decoded value and returns it (possibly normalized) or fails with `ConfigError`. It runs automatically on every load path: `load`, `loadFrom`, `loadOrDefault`, `discover`, and `update`.

```typescript
import { ConfigFile, ConfigError, FirstMatch, TomlCodec, UpwardWalk } from "config-file-effect";
import { Effect, Schema } from "effect";
import { AppDirsConfig, XdgConfigResolver, XdgConfigLive, XdgSavePath } from "xdg-effect";

const MyConfig = Schema.Struct({
  name: Schema.String,
  port: Schema.Number,
  maxWorkers: Schema.optional(Schema.Number),
});
type MyConfig = typeof MyConfig.Type;

const MyConfigFile = ConfigFile.Tag<MyConfig>("my-tool/Config");

const layer = XdgConfigLive({
  app: new AppDirsConfig({ namespace: "my-tool" }),
  config: {
    tag: MyConfigFile,
    schema: MyConfig,
    codec: TomlCodec,
    strategy: FirstMatch,
    resolvers: [
      UpwardWalk({ filename: "my-tool.config.toml" }),
      XdgConfigResolver({ filename: "config.toml" }),
    ],
    defaultPath: XdgSavePath("config.toml"),
    validate: (config) => {
      if (config.port < 1 || config.port > 65535) {
        return Effect.fail(
          new ConfigError({ operation: "validate", reason: `port ${config.port} out of range (1-65535)` }),
        );
      }
      // Normalize: clamp maxWorkers to available CPUs
      const cpus = navigator?.hardwareConcurrency ?? 4;
      return Effect.succeed({
        ...config,
        maxWorkers: config.maxWorkers !== undefined ? Math.min(config.maxWorkers, cpus) : undefined,
      });
    },
  },
});
```

Use the validate callback for:

- Cross-field constraints the schema cannot express (port ranges, mutually exclusive options)
- Normalization (clamping values, resolving relative paths, setting computed defaults)
- External checks (verifying a referenced file exists, checking network reachability)

### The validate method

`ConfigFileService` also exposes a `validate` method that runs an unknown value through the schema and the validate callback without reading from disk. Use it for programmatic validation — for example, validating user input before saving, or implementing a `validate` CLI command:

```typescript
const program = Effect.gen(function* () {
  const configFile = yield* MyConfigFile;

  // Validate without loading from disk
  const result = yield* configFile.validate({ name: "test", port: 3000 });
  console.log("Valid config:", result);
});
```

The method decodes through `Schema.decodeUnknown`, then runs the validate callback if one was provided. It fails with `ConfigError` if either step fails.

### Adding More Resolvers

config-file-effect provides several built-in resolvers you can mix with `XdgConfigResolver`:

```typescript
import { ExplicitPath, GitRoot, StaticDir, UpwardWalk, WorkspaceRoot } from "config-file-effect";

const resolvers = [
  ExplicitPath("/etc/my-tool/config.toml"),    // system-wide
  UpwardWalk({ filename: "my-tool.config.toml" }),  // project-local
  WorkspaceRoot({ filename: "my-tool.config.toml" }),  // monorepo root
  GitRoot({ filename: ".my-tool.toml" }),      // git repo root
  XdgConfigResolver({ filename: "config.toml" }),      // user global
];
```

See the [config-file-effect documentation](https://github.com/spencerbeggs/config-file-effect) for the full resolver API.

## XdgFullLive

When your application also needs SQLite cache and state, `XdgFullLive` extends `XdgConfigLive` with both SQLite services:

```typescript
import { XdgFullLive } from "xdg-effect";

const layer = XdgFullLive({
  app: new AppDirsConfig({ namespace: "my-tool" }),
  config: { /* same as XdgConfigLive */ },
  migrations: [
    { id: 1, name: "create-history", up: (client) => client.execute(`CREATE TABLE ...`) },
  ],
});
```

`XdgFullLive` requires both `FileSystem` and `SqlClient`. Note that `SqliteCache` and `SqliteState` share the same `SqlClient` instance — if you need separate databases, compose them individually instead.

---

[Previous: Resolving XDG Paths](./02-resolving-xdg-paths.md) | [Next: SQLite Cache](./04-sqlite-cache.md)
