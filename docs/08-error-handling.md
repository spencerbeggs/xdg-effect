# Error Handling

xdg-effect uses Effect's typed error channel with `Data.TaggedError` for every failure mode. Each error type carries structured context so you can handle failures precisely.

## Error Types

xdg-effect defines four error types. Config file errors (`ConfigError`, `CodecError`) are in config-file-effect, and JSON Schema errors (`JsonSchemaError`, `JsonSchemaValidationError`) are in json-schema-effect.

| Error | Tag | Fields | Raised when |
| ----- | --- | ------ | ----------- |
| `XdgError` | `"XdgError"` | `message` | `HOME` not set or invalid |
| `AppDirsError` | `"AppDirsError"` | `directory`, `reason` | Directory resolution fails |
| `CacheError` | `"CacheError"` | `operation`, `key?`, `reason` | Cache operation fails |
| `StateError` | `"StateError"` | `operation`, `reason` | Migration or state operation fails |

`XdgError` is the only error that takes `message` directly in its constructor. Every other error derives its `message` from the structured fields.

The `XdgEffectError` union covers all four types:

```typescript
type XdgEffectError = XdgError | AppDirsError | CacheError | StateError;
```

## catchTag Patterns

`Effect.catchTag` lets you recover from one specific error type while letting everything else propagate:

```typescript
import { Effect } from "effect";
import { AppDirs } from "xdg-effect";

const program = Effect.gen(function* () {
  const appDirs = yield* AppDirs;
  return yield* appDirs.config;
}).pipe(
  Effect.catchTag("AppDirsError", (error) => {
    console.log(`Directory resolution failed: ${error.reason}`);
    return Effect.succeed("/tmp/fallback");
  }),
);
```

### Handling config-file-effect errors

When using `XdgConfigLive`, config errors appear in the error channel. Import them from config-file-effect:

```typescript
import { ConfigFile } from "config-file-effect";
import { Effect } from "effect";

const loadConfig = Effect.gen(function* () {
  const configFile = yield* MyToolConfigFile;
  return yield* configFile.load;
}).pipe(
  Effect.catchTag("ConfigError", (error) => {
    if (error.operation === "resolve") {
      console.log("No config found, using defaults");
      return Effect.succeed({ name: "my-tool", port: 3000 });
    }
    return Effect.fail(error);
  }),
);
```

A `ConfigError` with `operation === "resolve"` means no config file was found. Other operations (`"parse"`, `"validate"`, `"read"`) mean a file was found but is broken — re-throw those.

## mapError for App-Specific Errors

`Effect.mapError` converts any error into your application's error type:

```typescript
import { Data, Effect } from "effect";

class AppError extends Data.TaggedError("AppError")<{
  readonly message: string;
}> {}

const loadConfig = Effect.gen(function* () {
  const configFile = yield* MyToolConfigFile;
  return yield* configFile.load;
}).pipe(
  Effect.mapError(
    (error) => new AppError({ message: `Config failed: ${error.message}` }),
  ),
);
```

## XdgEffectError Union

When a program uses several xdg-effect services, `Effect.catchAll` with a `switch` on `_tag` provides exhaustive coverage:

```typescript
import { Effect } from "effect";
import type { XdgEffectError } from "xdg-effect";

const program = Effect.gen(function* () {
  // ... use multiple xdg-effect services
}).pipe(
  Effect.catchAll((error: XdgEffectError) => {
    switch (error._tag) {
      case "XdgError":
        return Effect.fail(`Environment issue: ${error.message}`);
      case "AppDirsError":
        return Effect.fail(`Directory issue: ${error.message}`);
      case "CacheError":
        return Effect.fail(`Cache issue: ${error.message}`);
      case "StateError":
        return Effect.fail(`State issue: ${error.message}`);
    }
  }),
);
```

## Runnable Example

The following program loads a TOML config file with a graceful fallback when no config file exists:

```typescript
import { NodeFileSystem } from "@effect/platform-node";
import { ConfigFile, FirstMatch, TomlCodec, UpwardWalk } from "config-file-effect";
import { Effect, Schema } from "effect";
import { AppDirsConfig, XdgConfigResolver, XdgConfigLive } from "xdg-effect";

const MyToolConfig = Schema.Struct({
  name: Schema.String,
  port: Schema.Number,
  debug: Schema.optional(Schema.Boolean, { default: () => false }),
});
type MyToolConfig = typeof MyToolConfig.Type;

const MyToolConfigFile = ConfigFile.Tag<MyToolConfig>("my-tool/Config");

const defaults: MyToolConfig = { name: "my-tool", port: 3000, debug: false };

const loadConfigSafe = Effect.gen(function* () {
  const configFile = yield* MyToolConfigFile;
  return yield* configFile.load;
}).pipe(
  Effect.catchTag("ConfigError", (error) => {
    if (error.operation === "resolve") {
      console.log("No config found, using defaults");
      return Effect.succeed(defaults);
    }
    console.error(`Config error${error.path ? ` at ${error.path}` : ""}: ${error.reason}`);
    return Effect.fail(error);
  }),
);

const layer = XdgConfigLive({
  app: new AppDirsConfig({ namespace: "my-tool" }),
  config: {
    tag: MyToolConfigFile,
    schema: MyToolConfig,
    codec: TomlCodec,
    strategy: FirstMatch,
    resolvers: [
      UpwardWalk({ filename: "my-tool.config.toml" }),
      XdgConfigResolver({ filename: "config.toml" }),
    ],
  },
});

Effect.runPromise(
  loadConfigSafe.pipe(
    Effect.provide(layer),
    Effect.provide(NodeFileSystem.layer),
  ),
).then((config) => console.log("Loaded:", config));
```

---

[Previous: Testing](./07-testing.md) | [Next: API Reference](./09-api-reference.md)
