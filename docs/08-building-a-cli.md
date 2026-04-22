# Building a CLI

This guide shows how to integrate xdg-effect with `@effect/cli` to build a complete XDG-aware command-line tool. We'll use patterns from repo-sync, a real-world CLI that syncs GitHub repository settings from TOML config files, as a case study.

## @effect/cli Overview

[`@effect/cli`](https://github.com/Effect-TS/effect/tree/main/packages/cli) provides type-safe command and option parsing for Effect applications.

- **`Command.make`** — defines a command with a name, typed options, and a handler function
- **`Options.file`**, **`Options.text`**, **`Options.boolean`** — option constructors for common value types
- **`Command.withSubcommands`** — composes a root command with nested subcommands
- **`Command.run`** — creates the CLI entry point that parses `process.argv` and dispatches to the matching command handler

Install the package alongside xdg-effect:

```bash
pnpm add @effect/cli xdg-effect effect @effect/platform @effect/platform-node
```

## Project Structure

A recommended layout for a CLI that uses xdg-effect:

```text
src/
  cli/
    index.ts          # Root command + bootstrap
    commands/
      sync.ts         # Individual command files
      validate.ts
  services/           # App-specific Effect services
  schemas/            # Effect Schema definitions
  index.ts            # Library exports (if any)
```

Keep commands thin: each command file exports one `Command.make` call. The business logic lives in services under `src/services/`. The `src/cli/index.ts` file wires commands together, composes layers, and calls `NodeRuntime.runMain`.

## Config Discovery Pattern

A CLI typically resolves its config from three tiers, in descending priority:

1. `--config` flag (`ExplicitPath`) — user passed an explicit path, take it
2. Walk up from `cwd` (`UpwardWalk`) — project-local config alongside source files
3. XDG config dir (`XdgConfig`) — the user's personal config at `~/.config/my-tool/`

This pattern replaces hand-rolled discovery code. repo-sync's `lib/xdg.ts` reads `XDG_CONFIG_HOME` manually and `lib/config-path.ts` walks directories with synchronous `existsSync` calls. xdg-effect encodes the same behavior as a declarative resolver array:

```typescript
// Before (hand-rolled):
function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".config");
  return join(base, APP_NAME);
}

// After (xdg-effect):
const resolvers = [
  ExplicitPath(configFlag),
  UpwardWalk({ filename: "repo-sync.config.toml" }),
  XdgConfig({ filename: "config.toml" }),
];
```

The resolver array is processed by `configFile.load` at runtime. The first resolver that finds a file wins when using `FirstMatch`, or all found files are merged when using `LayeredMerge`. Resolver errors (permission denied, missing directories) are caught internally and treated as "not found", so the chain never aborts early.

The `--config` flag value flows from a parsed `Option<string>` into the resolver:

```typescript
import { Options } from "@effect/cli";
import { Option } from "effect";
import { ExplicitPath } from "xdg-effect";

const configOption = Options.file("config").pipe(
  Options.withDescription("Path to config file"),
  Options.optional,
);

// Inside the command handler:
({ config }) => Effect.gen(function* () {
  const configPath = Option.getOrUndefined(config);
  const resolvers = [
    ...(configPath !== undefined ? [ExplicitPath(configPath)] : []),
    UpwardWalk({ filename: "repo-sync.config.toml" }),
    XdgConfig({ filename: "config.toml" }),
  ];
})
```

When `--config` is omitted, `config` is `Option.none()` and `ExplicitPath` is excluded from the resolver array. The remaining resolvers continue the search.

## Credentials Pattern

CLIs often separate two config files:

- **Config file** — checked into version control, defines behavior
- **Credentials file** — stored only in the XDG config dir, never committed

repo-sync follows this pattern: `repo-sync.config.toml` is version-controlled while `repo-sync.credentials.toml` lives at `~/.config/repo-sync/` and is excluded via `.gitignore`.

Model this with a second `ConfigFile` service registered under its own tag. Use `XdgConfig` as the only resolver — credentials should never come from a project-local walk:

```typescript
import { Schema } from "effect";
import {
  ConfigFile,
  TomlCodec,
  FirstMatch,
  XdgConfig,
} from "xdg-effect";

const Credentials = Schema.Struct({
  profiles: Schema.Record({
    key: Schema.String,
    value: Schema.Struct({
      github_token: Schema.String,
    }),
  }),
});
type Credentials = typeof Credentials.Type;

const RepoSyncCredentials = ConfigFile.Tag<Credentials>(
  "repo-sync/Credentials",
);

const credentialsLayer = ConfigFile.Live({
  tag: RepoSyncCredentials,
  schema: Credentials,
  codec: TomlCodec,
  strategy: FirstMatch,
  resolvers: [XdgConfig({ filename: "credentials.toml" })],
});
```

`ConfigFile.Tag` takes a namespaced string `id`. Multiple `ConfigFile` services can coexist in the same layer graph as long as each has a distinct `id`. The credentials service is completely separate from the main config service — they have different schemas, different resolvers, and different tags.

## Layer Composition Pattern

With xdg-effect layers and app-specific service layers, compose in this order:

1. **xdg-effect base** — `XdgConfigLive` (or `XdgLive`) provides `XdgResolver`, `AppDirs`, and `ConfigFile`
2. **Credentials layer** — a second `ConfigFile.Live` for the credentials file
3. **App service layers** — business logic services that depend on config and credentials

```typescript
import { Layer } from "effect";

// xdg-effect base: provides XdgResolver + AppDirs + SyncConfigFile
const xdgLayer = XdgConfigLive({
  app: new AppDirsConfig({ namespace: "repo-sync" }),
  config: {
    tag: SyncConfigFile,
    schema: SyncConfig,
    codec: TomlCodec,
    strategy: FirstMatch,
    resolvers: [
      UpwardWalk({ filename: "repo-sync.config.toml" }),
      XdgConfig({ filename: "config.toml" }),
    ],
  },
});

// Credentials layer: needs AppDirs from xdgLayer
const credsLayer = ConfigFile.Live({
  tag: RepoSyncCredentials,
  schema: Credentials,
  codec: TomlCodec,
  strategy: FirstMatch,
  resolvers: [XdgConfig({ filename: "credentials.toml" })],
}).pipe(Layer.provide(xdgLayer));

// Full app layer
const appLayer = Layer.mergeAll(xdgLayer, credsLayer);
```

Then provide `appLayer` and `NodeContext.layer` to the program at the bootstrap point in `cli/index.ts`.

## Runnable Example

The following skeleton wires `sync` and `validate` subcommands with config discovery, a credentials file, and `NodeRuntime.runMain`:

```typescript
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Command, Options } from "@effect/cli";
import { Effect, Layer, Option, Schema } from "effect";
import {
  AppDirsConfig,
  ConfigFile,
  TomlCodec,
  FirstMatch,
  UpwardWalk,
  XdgConfig,
  XdgConfigLive,
} from "xdg-effect";

// -- Config Schema --
const SyncConfig = Schema.Struct({
  owner: Schema.String,
  log_level: Schema.optional(
    Schema.Literal("silent", "info", "verbose", "debug"),
    { default: () => "info" as const },
  ),
});
type SyncConfig = typeof SyncConfig.Type;

const SyncConfigFile = ConfigFile.Tag<SyncConfig>("repo-sync/Config");

// -- Credentials Schema --
const Credentials = Schema.Struct({
  profiles: Schema.Record({
    key: Schema.String,
    value: Schema.Struct({ github_token: Schema.String }),
  }),
});
type Credentials = typeof Credentials.Type;

const RepoSyncCredentials = ConfigFile.Tag<Credentials>(
  "repo-sync/Credentials",
);

// -- Options --
const configOption = Options.file("config").pipe(
  Options.withDescription("Path to config file"),
  Options.optional,
);

// -- Commands --
const syncCommand = Command.make(
  "sync",
  {
    config: configOption,
    dryRun: Options.boolean("dry-run").pipe(Options.withDefault(false)),
  },
  ({ dryRun }) =>
    Effect.gen(function* () {
      const configFile = yield* SyncConfigFile;
      const credsFile = yield* RepoSyncCredentials;

      const syncConfig = yield* configFile.load;
      const credentials = yield* credsFile.load;

      const profiles = Object.keys(credentials.profiles);
      const token = profiles[0]
        ? credentials.profiles[profiles[0]]?.github_token
        : undefined;

      if (!token) {
        yield* Effect.fail(new Error("No GitHub token found in credentials."));
      }

      console.log(`Syncing repos for ${syncConfig.owner}...`);
      if (dryRun) console.log("(dry run — no changes will be made)");
    }),
).pipe(Command.withDescription("Sync repos with GitHub"));

const validateCommand = Command.make(
  "validate",
  { config: configOption },
  () =>
    Effect.gen(function* () {
      const configFile = yield* SyncConfigFile;
      const config = yield* configFile.load;
      console.log("Config is valid:", config);
    }),
).pipe(Command.withDescription("Validate config without API calls"));

// -- Root Command --
const rootCommand = Command.make("my-tool").pipe(
  Command.withSubcommands([syncCommand, validateCommand]),
);

// -- Bootstrap --
const cli = Command.run(rootCommand, {
  name: "my-tool",
  version: "1.0.0",
});

// xdg-effect base layer: XdgResolver + AppDirs + SyncConfigFile
const xdgLayer = XdgConfigLive({
  app: new AppDirsConfig({ namespace: "my-tool" }),
  config: {
    tag: SyncConfigFile,
    schema: SyncConfig,
    codec: TomlCodec,
    strategy: FirstMatch,
    resolvers: [
      UpwardWalk({ filename: "my-tool.config.toml" }),
      XdgConfig({ filename: "config.toml" }),
    ],
  },
});

// Credentials layer: resolves only from XDG config dir
const credentialsLayer = ConfigFile.Live({
  tag: RepoSyncCredentials,
  schema: Credentials,
  codec: TomlCodec,
  strategy: FirstMatch,
  resolvers: [XdgConfig({ filename: "credentials.toml" })],
}).pipe(Layer.provide(xdgLayer));

const appLayer = Layer.mergeAll(xdgLayer, credentialsLayer);

const program = Effect.suspend(() => cli(process.argv)).pipe(
  Effect.provide(appLayer),
  Effect.provide(NodeContext.layer),
);

NodeRuntime.runMain(program);
```

### Key points

- `SyncConfigFile` and `RepoSyncCredentials` use different `ConfigFile.Tag` ids, so both can live in the same layer graph simultaneously
- The credentials layer is provided `xdgLayer` so it can resolve `AppDirs` for `XdgConfig`
- `Layer.mergeAll` combines both layers; `NodeContext.layer` is provided separately at the `Effect.provide` call so `@effect/platform-node` services are available to all commands
- `NodeRuntime.runMain` handles fiber supervision, signal handling, and clean shutdown
- The `--config` option is threaded through to each command but left out of the global resolvers in this skeleton; pass its value into `ExplicitPath` when wiring resolvers per-command (see [Config Discovery Pattern](#config-discovery-pattern))

### Dynamic Config Path

In the example above, the resolver chain is defined at bootstrap time and doesn't use the `--config` flag. To support a `--config` flag that overrides the resolver chain, construct the layer inside the command handler:

```typescript
const syncCommand = Command.make(
  "sync",
  { config: configOption, dryRun: Options.boolean("dry-run").pipe(
    Options.withDefault(false),
  ) },
  ({ config, dryRun }) =>
    Effect.gen(function* () {
      // Build resolvers dynamically based on CLI flag
      const resolvers = [
        ...(Option.isSome(config)
          ? [ExplicitPath(config.value)]
          : []),
        UpwardWalk({ filename: "my-tool.config.toml" }),
        XdgConfig({ filename: "config.toml" }),
      ];

      const configLayer = XdgConfigLive({
        app: new AppDirsConfig({ namespace: "my-tool" }),
        config: {
          tag: SyncConfigFile,
          schema: SyncConfig,
          codec: TomlCodec,
          strategy: FirstMatch,
          resolvers,
        },
      });

      const syncConfig = yield* Effect.provide(
        Effect.gen(function* () {
          const cf = yield* SyncConfigFile;
          return yield* cf.load;
        }),
        Layer.merge(configLayer, NodeFileSystem.layer),
      );

      console.log(`Syncing for ${syncConfig.owner}...`);
      if (dryRun) console.log("(dry run)");
    }),
);
```

This requires importing `Option` from `effect` and `NodeFileSystem` from `@effect/platform-node`.

---

[Previous: SQLite State](./07-sqlite-state.md) | [Next: Testing](./09-testing.md)
