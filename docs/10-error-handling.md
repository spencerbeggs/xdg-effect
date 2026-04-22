# Error Handling

xdg-effect uses Effect's typed error channel with `Data.TaggedError` for every failure mode. Each error type carries structured context (operation, path, reason) so you can handle failures precisely.

## Error Types

All eight error types are exported from `xdg-effect`. Each extends `Data.TaggedError`, which attaches a `_tag` discriminant used for pattern matching. Most errors expose a computed `message` getter that formats the fields into a human-readable string.

| Error | Tag | Fields | Raised When |
| ----- | --- | ------ | ----------- |
| `XdgError` | `"XdgError"` | `message` | `HOME` not set or invalid |
| `AppDirsError` | `"AppDirsError"` | `directory`, `reason` | Directory resolution fails |
| `ConfigError` | `"ConfigError"` | `operation`, `path?`, `reason` | Config read/parse/validate/write fails |
| `CodecError` | `"CodecError"` | `codec`, `operation` (`"parse"` \| `"stringify"`), `reason` | JSON/TOML parse or stringify fails |
| `JsonSchemaError` | `"JsonSchemaError"` | `operation`, `name`, `reason` | Schema generation or write fails |
| `JsonSchemaValidationError` | `"JsonSchemaValidationError"` | `name`, `errors` | Ajv validation fails (see [JSON Schema Advanced](./05-json-schema-advanced.md)) |
| `CacheError` | `"CacheError"` | `operation`, `key?`, `reason` | Cache operation fails |
| `StateError` | `"StateError"` | `operation`, `reason` | Migration or state operation fails |

`XdgError` is the only error that takes `message` directly in its constructor. Every other error derives its `message` from the structured fields — for example, `ConfigError` produces `Config <operation> failed at "<path>": <reason>`.

The `XdgEffectError` union covers all eight types and is useful when you want to handle any xdg-effect error in one place:

```typescript
type XdgEffectError = XdgError | AppDirsError | ConfigError | CodecError | JsonSchemaError | JsonSchemaValidationError | CacheError | StateError;
```

## catchTag Patterns

`Effect.catchTag` lets you recover from one specific error type while letting everything else propagate:

```typescript
import { Effect } from "effect";
import { ConfigFile } from "xdg-effect";

// Assuming MyToolConfigFile is defined elsewhere
const loadConfig = Effect.gen(function* () {
  const configFile = yield* MyToolConfigFile;
  return yield* configFile.load;
}).pipe(
  Effect.catchTag("ConfigError", (error) => {
    if (error.operation === "resolve") {
      console.log("No config found, using defaults");
      return Effect.succeed({ name: "my-tool", port: 3000, debug: false });
    }
    return Effect.fail(error);
  }),
);
```

A `ConfigError` with `operation === "resolve"` means no config file was found — none of the resolvers matched an existing file. This is the safe case to swallow and substitute defaults.

Other operations (`"parse"`, `"validate"`, `"read"`) mean a file was found but is broken. Re-throwing with `Effect.fail(error)` ensures those propagate to the caller. Keeping the distinction in the `operation` field is what makes this pattern possible without separate error types.

## mapError for App-Specific Errors

When you own the error boundary (for example, at a service layer or a command handler), `Effect.mapError` converts any xdg-effect error into your application's error type:

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

Because every xdg-effect error has a `message` getter, the mapping works uniformly without a switch statement. The resulting effect has `AppError` in its error channel instead of the library-specific type.

## XdgEffectError Union

When a program uses several xdg-effect services, the error channel is a union of multiple error types. `Effect.catchAll` with `XdgEffectError` and a `switch` on `_tag` provides exhaustive coverage:

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
      case "ConfigError":
        return Effect.fail(`Config issue: ${error.message}`);
      case "CacheError":
        return Effect.fail(`Cache issue: ${error.message}`);
      default:
        return Effect.fail(`Unexpected: ${error.message}`);
    }
  }),
);
```

The `default` branch is a safety net for error types not explicitly handled. TypeScript's exhaustiveness checking can narrow the `default` branch to `never` if you cover all eight tags.

> **Note:** The `default` branch reaches `never` only if the error channel contains exclusively `XdgEffectError` types. If your program also uses services with other error types (e.g., `SqlError` from `@effect/sql`), those will also appear in the error union and the `default` case will be reachable.

## Runnable Example

The following program loads a TOML config file with a graceful fallback when no config file exists, and a hard fail when the file exists but is broken:

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
    console.error(`Config error at ${error.path}: ${error.reason}`);
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
      XdgConfig({ filename: "config.toml" }),
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

[Previous: Testing](./09-testing.md) | [Next: API Reference](./11-api-reference.md)
