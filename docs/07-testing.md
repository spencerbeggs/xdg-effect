# Testing

xdg-effect is designed for testability. Every service reads configuration through Effect's dependency injection, so you can swap implementations in tests without touching environment variables or the real filesystem.

## Test Layers

Every service provides a `.Test` static that creates a pre-configured test layer with sensible defaults. Test layers use scoped temp directories that are cleaned up automatically when the scope closes.

| Service | Test Layer | Notes |
| ------- | ---------- | ----- |
| `XdgResolver.Test(options?)` | Provides `XdgResolver` | Uses a temp dir for HOME by default; pass options to override individual paths |
| `AppDirs.Test({ namespace })` | Provides `XdgResolver` + `AppDirs` | Composes a test XdgResolver with a real AppDirs backed by NodeFileSystem |
| `SqliteCache.Test()` | Provides `SqliteCache` | Uses an in-memory SQLite database |
| `SqliteState.Test(options)` | Provides `SqliteState` | Uses an in-memory SQLite database with migrations |

Config file test layers are in config-file-effect:

| Service | Test Layer | Notes |
| ------- | ---------- | ----- |
| `ConfigFile.Test(options)` | Provides `ConfigFileService<A>` | Accepts `files: Record<string, string>` for pre-populating test files |

JSON Schema test layers are in json-schema-effect:

| Service | Test Layer | Notes |
| ------- | ---------- | ----- |
| `JsonSchemaExporter.Test` | Provides `JsonSchemaExporter` | Scoped temp directory |
| `JsonSchemaValidator.Test` | Provides `JsonSchemaValidator` | Identical to Live (pure CPU, no I/O to mock) |

### When to use Test layers

- Use `.Test` statics for most tests — they handle temp dir lifecycle and wiring automatically
- Use custom layers when you need specific control over the environment
- `.Test` layers exercise the real service logic — they are integration-style, not mocks

```typescript
import { Effect } from "effect";
import { XdgResolver } from "xdg-effect";

const test = Effect.gen(function* () {
  const resolver = yield* XdgResolver;
  const home = yield* resolver.home;
  // home is a scoped temp directory
}).pipe(
  Effect.scoped,
  Effect.provide(XdgResolver.Test()),
);
```

Most `.Test` layers require `Scope` because they manage temp directory lifetimes. The exceptions are `SqliteCache.Test()` and `SqliteState.Test()`, which use in-memory SQLite databases and require no scope. Wrap test effects in `Effect.scoped` to ensure cleanup when using layers that do require a scope.

## Testing XdgResolver with ConfigProvider

Effect's `ConfigProvider` lets you override where `Config` values come from. Pass a custom provider built from a plain `Map` and wrap your test effect with `Effect.withConfigProvider`.

```typescript
import { ConfigProvider, Effect } from "effect";
import { XdgResolver } from "xdg-effect";

const testProvider = ConfigProvider.fromMap(
  new Map([
    ["HOME", "/test/home"],
    ["XDG_CONFIG_HOME", "/test/config"],
  ]),
);

const test = Effect.gen(function* () {
  const resolver = yield* XdgResolver;
  const home = yield* resolver.home;
  // home === "/test/home"
}).pipe(
  Effect.withConfigProvider(testProvider),
  Effect.provide(XdgResolver.Live),
);
```

### Testing with XdgConfigLive

When testing code that uses `XdgConfigLive`, import config-file-effect items from their package:

```typescript
import { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { ConfigFile, ExplicitPath, FirstMatch, TomlCodec } from "config-file-effect";
import { ConfigProvider, Effect, Schema } from "effect";
import { AppDirsConfig, XdgConfigLive } from "xdg-effect";

const TestConfig = Schema.Struct({ name: Schema.String });
type TestConfig = typeof TestConfig.Type;
const TestConfigFile = ConfigFile.Tag<TestConfig>("test/Config");

const testProvider = ConfigProvider.fromMap(
  new Map([["HOME", "/test/home"]]),
);

const test = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const tmpDir = yield* fs.makeTempDirectoryScoped();
  yield* fs.writeFileString(`${tmpDir}/config.toml`, 'name = "test"\n');

  const layer = XdgConfigLive({
    app: new AppDirsConfig({ namespace: "test-app" }),
    config: {
      tag: TestConfigFile,
      schema: TestConfig,
      codec: TomlCodec,
      strategy: FirstMatch,
      resolvers: [ExplicitPath(`${tmpDir}/config.toml`)],
    },
  });

  return yield* Effect.provide(
    Effect.gen(function* () {
      const cf = yield* TestConfigFile;
      return yield* cf.load;
    }),
    layer,
  );
}).pipe(
  Effect.withConfigProvider(testProvider),
  Effect.scoped,
  Effect.provide(NodeFileSystem.layer),
);
```

Note: `Effect.withConfigProvider` is applied outside `Effect.provide(layer)` so it takes effect when the layer is constructed.

## Testing with In-Memory Filesystem

Use `makeTempDirectoryScoped` to create isolated temp directories that are cleaned up automatically when the scope closes:

```typescript
import { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";

const withTempConfig = (configContent: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const tmpDir = yield* fs.makeTempDirectoryScoped();
    yield* fs.writeFileString(`${tmpDir}/config.toml`, configContent);
    return tmpDir;
  });
```

## Testing SqliteCache PubSub Events

Use `PubSub.subscribe` to capture events emitted during cache operations:

```typescript
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect, PubSub, Queue } from "effect";
import { SqliteCache } from "xdg-effect";

const test = Effect.gen(function* () {
  const cache = yield* SqliteCache;
  const subscriber = yield* PubSub.subscribe(cache.events);

  yield* cache.set({
    key: "test",
    value: new TextEncoder().encode("hello"),
  });

  const event = yield* Queue.take(subscriber);
  // event.event._tag === "Set"
}).pipe(
  Effect.scoped,
  Effect.provide(SqliteCache.Live()),
  Effect.provide(SqliteClient.layer({ filename: ":memory:" })),
);
```

## Complete Test File Example

The following Vitest file brings together XDG path testing, config file loading, and cache events:

```typescript
import { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { ConfigFile, ExplicitPath, FirstMatch, TomlCodec } from "config-file-effect";
import { ConfigProvider, Duration, Effect, Layer, Option, PubSub, Queue, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  AppDirs,
  AppDirsConfig,
  SqliteCache,
  XdgLive,
  XdgResolver,
} from "xdg-effect";

describe("xdg-effect", () => {
  it("resolves XDG paths with custom ConfigProvider", async () => {
    const provider = ConfigProvider.fromMap(
      new Map([["HOME", "/test/home"], ["XDG_CONFIG_HOME", "/test/config"]]),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const resolver = yield* XdgResolver;
        return yield* resolver.resolveAll;
      }).pipe(
        Effect.withConfigProvider(provider),
        Effect.provide(XdgResolver.Live),
      ),
    );

    expect(result.home).toBe("/test/home");
    expect(Option.getOrNull(result.configHome)).toBe("/test/config");
  });

  it("loads config from temp directory", async () => {
    const TestConfig = Schema.Struct({
      name: Schema.String,
      port: Schema.Number,
    });
    type TestConfig = typeof TestConfig.Type;
    const TestConfigFile = ConfigFile.Tag<TestConfig>("test/Config");

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmpDir = yield* fs.makeTempDirectoryScoped();
        yield* fs.writeFileString(
          `${tmpDir}/config.toml`,
          'name = "test"\nport = 3000\n',
        );

        const configLayer = ConfigFile.Live({
          tag: TestConfigFile,
          schema: TestConfig,
          codec: TomlCodec,
          strategy: FirstMatch,
          resolvers: [ExplicitPath(`${tmpDir}/config.toml`)],
        });

        return yield* Effect.provide(
          Effect.gen(function* () {
            const config = yield* TestConfigFile;
            return yield* config.load;
          }),
          configLayer,
        );
      }).pipe(
        Effect.scoped,
        Effect.provide(NodeFileSystem.layer),
      ),
    );

    expect(result.name).toBe("test");
    expect(result.port).toBe(3000);
  });

  it("captures cache PubSub events", async () => {
    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const cache = yield* SqliteCache;
        const subscriber = yield* PubSub.subscribe(cache.events);

        yield* cache.set({
          key: "test-key",
          value: new TextEncoder().encode("hello"),
          tags: ["test"],
          ttl: Duration.minutes(5),
        });

        yield* cache.get("test-key");
        yield* cache.get("missing-key");

        const collected: Array<string> = [];
        let next = yield* Queue.poll(subscriber);
        while (Option.isSome(next)) {
          collected.push(next.value.event._tag);
          next = yield* Queue.poll(subscriber);
        }

        return collected;
      }).pipe(
        Effect.scoped,
        Effect.provide(SqliteCache.Live()),
        Effect.provide(SqliteClient.layer({ filename: ":memory:" })),
      ),
    );

    expect(events).toContain("Set");
    expect(events).toContain("Hit");
    expect(events).toContain("Miss");
  });
});
```

---

[Previous: Building a CLI](./06-building-a-cli.md) | [Next: Error Handling](./08-error-handling.md)
