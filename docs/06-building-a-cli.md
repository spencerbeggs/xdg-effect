# Building a CLI

This guide shows how the three packages compose together to build an XDG-compliant CLI tool with config file support and JSON Schema generation for editor autocompletion.

## Installation

```bash
pnpm add xdg-effect config-file-effect json-schema-effect \
  effect @effect/cli @effect/platform @effect/platform-node
```

## Define Your Config Schema

Start with an Effect Schema for your config file. Add `tombi()` and `taplo()` annotations from json-schema-effect for TOML editor tooling support:

```typescript
// src/schemas/config.ts
import { taplo, tombi } from "json-schema-effect";
import { Schema } from "effect";

export const AppConfig = Schema.Struct({
  owner: Schema.String.annotations({
    description: "GitHub owner (user or org)",
  }),
  log_level: Schema.optional(
    Schema.Literal("silent", "info", "verbose", "debug"),
    { default: () => "info" as const },
  ),
  repos: Schema.optional(Schema.Array(Schema.String), {
    default: () => [],
  }),
}).annotations({
  identifier: "AppConfig",
  title: "Application Configuration",
  jsonSchema: {
    ...tombi({ tableKeysOrder: "schema" }),
    ...taplo({
      links: { key: "https://example.com/docs/configuration" },
    }),
  },
});

export type AppConfig = typeof AppConfig.Type;
```

`tombi()` and `taplo()` produce `x-tombi-*` and `x-taplo` extension keys in the generated JSON Schema, which Tombi and Taplo TOML language servers use for formatting, navigation, and autocompletion.

## Wire Up Config Loading

Create a config service layer using xdg-effect's aggregate layer with config-file-effect's codecs and resolvers. The optional `validate` callback adds semantic validation beyond what the schema enforces — it runs automatically on every load path:

```typescript
// src/services/config.ts
import { ConfigError, ConfigFile, FirstMatch, TomlCodec, UpwardWalk } from "config-file-effect";
import { Effect } from "effect";
import { AppDirsConfig, XdgConfigResolver, XdgConfigLive, XdgSavePath } from "xdg-effect";
import { AppConfig } from "../schemas/config.js";

export const AppConfigFile = ConfigFile.Tag<AppConfig>("my-tool/Config");

export const ConfigLive = XdgConfigLive({
  app: new AppDirsConfig({ namespace: "my-tool" }),
  config: {
    tag: AppConfigFile,
    schema: AppConfig,
    codec: TomlCodec,
    strategy: FirstMatch,
    resolvers: [
      UpwardWalk({ filename: "my-tool.config.toml" }),
      XdgConfigResolver({ filename: "config.toml" }),
    ],
    defaultPath: XdgSavePath("config.toml"),
    validate: (config) => {
      if (config.repos.length === 0 && config.owner === "") {
        return Effect.fail(
          new ConfigError({ operation: "validate", reason: "owner is required when no repos are listed" }),
        );
      }
      return Effect.succeed(config);
    },
  },
});
```

Or use the preset for less boilerplate:

```typescript
export const ConfigLive = XdgConfigLive.toml({
  namespace: "my-tool",
  filename: "config.toml",
  tag: AppConfigFile,
  schema: AppConfig,
  validate: (config) => {
    if (config.repos.length === 0 && config.owner === "") {
      return Effect.fail(
        new ConfigError({ operation: "validate", reason: "owner is required when no repos are listed" }),
      );
    }
    return Effect.succeed(config);
  },
});
```

The resolver chain gives you natural precedence:

1. `UpwardWalk` finds a project-local `my-tool.config.toml` by walking up from `cwd`
2. `XdgConfigResolver` falls back to the user's global `~/.config/my-tool/config.toml`

`XdgSavePath` enables `save()` and `update()` to write to the XDG location. The `validate` callback catches business-rule violations that the schema cannot express.

## Build the CLI

Use `@effect/cli` to define commands that consume the config service:

```typescript
// src/cli/index.ts
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Args, Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { AppConfigFile, ConfigLive } from "../services/config.js";

const verboseOption = Options.boolean("verbose").pipe(Options.withAlias("v"));

const syncCommand = Command.make("sync", { verbose: verboseOption }, ({ verbose }) =>
  Effect.gen(function* () {
    const configFile = yield* AppConfigFile;
    const config = yield* configFile.load;

    const logLevel = verbose ? "verbose" : config.log_level;
    console.log(`Syncing repos for ${config.owner} (log level: ${logLevel})`);

    for (const repo of config.repos) {
      console.log(`  syncing ${config.owner}/${repo}...`);
    }
  }),
);

const validateCommand = Command.make("validate", {}, () =>
  Effect.gen(function* () {
    const configFile = yield* AppConfigFile;
    const config = yield* configFile.load;
    console.log("Config is valid:", config);
  }).pipe(
    Effect.catchTag("ConfigError", (error) => {
      if (error.operation === "resolve") {
        return Effect.sync(() => console.error("No config file found"));
      }
      return Effect.sync(() => console.error(`Validation failed: ${error.reason}`));
    }),
  ),
);

const initCommand = Command.make("init", {}, () =>
  Effect.gen(function* () {
    const configFile = yield* AppConfigFile;
    yield* configFile.save({ owner: "my-org", log_level: "info", repos: [] });
    console.log("Config file created in XDG config directory");
  }),
);

const app = Command.make("my-tool").pipe(
  Command.withSubcommands([syncCommand, validateCommand, initCommand]),
);

const cli = Command.run(app, { name: "my-tool", version: "1.0.0" });

const program = Effect.suspend(() => cli(process.argv)).pipe(
  Effect.provide(ConfigLive),
  Effect.provide(NodeContext.layer),
);

NodeRuntime.runMain(program);
```

## Generate JSON Schemas

Create a build script that generates JSON Schema files from your Effect Schemas. This runs at build time, not runtime:

```typescript
// scripts/generate-schemas.ts
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { JsonSchemaExporter, JsonSchemaValidator } from "json-schema-effect";
import { AppConfig } from "../src/schemas/config.js";

const ExporterLayer = Layer.provide(JsonSchemaExporter.Live, NodeFileSystem.layer);
const ValidatorLayer = JsonSchemaValidator.Live;
const SchemaLayer = Layer.mergeAll(ExporterLayer, ValidatorLayer);

const program = Effect.gen(function* () {
  const exporter = yield* JsonSchemaExporter;
  const validator = yield* JsonSchemaValidator;

  // Generate
  const output = yield* exporter.generate({
    name: "my-tool.config",
    schema: AppConfig,
    rootDefName: "AppConfig",
  });

  // Validate (strict mode checks Tombi conventions + Ajv correctness)
  yield* validator.validate(output, { strict: true, ajvStrict: true });

  // Write to disk (idempotent — skips if unchanged)
  const result = yield* exporter.write(output, "schemas/my-tool.config.schema.json");
  console.log(`Schema: ${result._tag} ${result.path}`);
});

Effect.runPromise(Effect.provide(program, SchemaLayer));
```

Add it to your build scripts:

```json
{
  "scripts": {
    "generate:schemas": "tsx scripts/generate-schemas.ts"
  }
}
```

The generated schema includes `x-tombi-*` and `x-taplo` extension keys, giving TOML editors rich autocompletion and formatting support.

## Config File Example

The generated TOML config file looks like:

```toml
# my-tool.config.toml
owner = "my-org"
log_level = "info"
repos = ["repo-one", "repo-two"]
```

With the JSON Schema published alongside your package, TOML editors with Tombi or Taplo support provide autocompletion, validation, and inline documentation.

## Layer Composition Summary

```text
NodeContext.layer
  +-- NodeFileSystem.layer
  +-- ConfigLive (XdgConfigLive)
        +-- XdgLive (XdgResolver.Live + AppDirs.Live)
        +-- ConfigFile.Live (from config-file-effect)
              +-- TomlCodec
              +-- UpwardWalk + XdgConfigResolver resolvers
              +-- FirstMatch strategy
```

The key insight: `XdgConfigLive` composes xdg-effect's path resolution with config-file-effect's file loading. You import codecs, resolvers, and strategies from config-file-effect, and XDG bridges from xdg-effect. The two packages compose at the layer level.

---

[Previous: SQLite State](./05-sqlite-state.md) | [Next: Testing](./07-testing.md)
