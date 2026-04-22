# Testing

xdg-effect is designed for testability. Every service reads configuration through Effect's dependency injection, so you can swap implementations in tests without touching environment variables or the real filesystem.

## Test Layers

Every service provides a `.Test` static that creates a pre-configured test layer with sensible defaults. Test layers use scoped temp directories that are cleaned up automatically when the scope closes.

| Service | Test Layer | Notes |
| ------- | ---------- | ----- |
| `XdgResolver.Test(options?)` | Provides `XdgResolver` | Uses a temp dir for HOME by default; pass options to override individual paths (home, configHome, dataHome, etc.) as plain strings |
| `AppDirs.Test({ namespace })` | Provides `XdgResolver` + `AppDirs` | Composes a test XdgResolver with a real AppDirs backed by NodeFileSystem |
| `ConfigFile.Test(options)` | Provides `ConfigFileService<A>` | Accepts all `ConfigFileOptions` fields plus an optional `files: Record<string, string>` for pre-populating test files in temp directories |
| `JsonSchemaExporter.Test` | Provides `JsonSchemaExporter` | Test layer for JSON Schema generation |
| `SqliteCache.Test` | Provides `SqliteCache` | Uses an in-memory SQLite database |
| `SqliteState.Test(options)` | Provides `SqliteState` | Uses an in-memory SQLite database with migrations |

### When to use Test layers

- Use `.Test` statics for most tests — they handle temp dir lifecycle and wiring automatically, so you write less boilerplate
- Use custom layers when you need specific control over the environment (custom `ConfigProvider`, explicit directory paths, testing error conditions)
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

All `.Test` layers require `Scope` because they manage temp directory lifetimes. Wrap test effects in `Effect.scoped` to ensure cleanup.

## Testing XdgResolver with ConfigProvider

Effect's `ConfigProvider` lets you override where `Config` values come from. Pass a custom provider built from a plain `Map` and wrap your test effect with `Effect.withConfigProvider`.

```typescript
import { Effect, ConfigProvider } from "effect";
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

`ConfigProvider.fromMap` constructs a provider that serves values from the map instead of reading `process.env`. Because `XdgResolver.Live` uses Effect `Config` internally, the provider intercepts every variable lookup — no environment mutation needed.

### Testing with XdgConfigLive

When testing code that uses the full `XdgConfigLive` layer (not just `XdgResolver.Live`), you need to apply `Effect.withConfigProvider` at the right level. The provider must be set before `XdgResolver.Live` reads from `Config`:

```typescript
import { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { ConfigProvider, Effect, Layer, Schema } from "effect";
import {
  AppDirsConfig,
  ConfigFile,
  ExplicitPath,
  FirstMatch,
  TomlCodec,
  XdgConfigLive,
} from "xdg-effect";

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

`@effect/platform`'s `FileSystem` is a service interface, not a direct import of Node's `fs` module. In tests, provide `NodeFileSystem.layer` and use `fs.makeTempDirectoryScoped` to create isolated temp directories that are cleaned up automatically when the scope closes.

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

`makeTempDirectoryScoped` ties the directory's lifetime to the current `Effect.scoped` scope. When the scope closes — after the test exits — the directory and its contents are deleted. Pair this with `ExplicitPath` to point a `ConfigFile` resolver at the temp directory.

## Testing Layer Composition

Provide layers in tests the same way as production. Use `Layer.provide` to swap a live layer for a test-specific one, or compose test layers alongside the real ones.

```typescript
import { Layer } from "effect";
import {
  AppDirsConfig,
  ConfigFile,
  TomlCodec,
  FirstMatch,
  ExplicitPath,
  XdgLive,
} from "xdg-effect";

// Build a test-specific config layer pointing at a known path
const testConfigLayer = ConfigFile.Live({
  tag: MyConfigFile,
  schema: MyConfig,
  codec: TomlCodec,
  strategy: FirstMatch,
  resolvers: [ExplicitPath("/tmp/test-config.toml")],
});

// Provide the real XDG base alongside the test config layer
const testAppLayer = Layer.mergeAll(
  XdgLive(new AppDirsConfig({ namespace: "my-tool" })),
  testConfigLayer,
);
```

Test aggregate layers (`XdgLive`, `XdgConfigLive`) as units — provide them unchanged and only substitute the pieces that need test-specific behavior. This keeps tests close to how the application runs in production.

## Testing SqliteCache PubSub Events

Use `PubSub.subscribe` to capture events emitted during cache operations. Subscribe before the operation, run the operation, then drain the queue. Use `:memory:` as the SQLite filename for complete test isolation — each test gets a fresh in-memory database with no shared state.

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
  // event.event.key === "test"
}).pipe(
  Effect.scoped,
  Effect.provide(SqliteCache.Live()),
  Effect.provide(SqliteClient.layer({ filename: ":memory:" })),
);
```

`PubSub.subscribe` returns a scoped `Queue`. Wrap the test effect in `Effect.scoped` so the subscription is released when the test finishes. `Queue.take` blocks until an event is available; use `Queue.poll` to drain without blocking when you want to check whether events arrived without waiting.

## Complete Test File Example

The following Vitest file brings all patterns together: a custom `ConfigProvider` for environment variables, a scoped temp directory for config files, and a PubSub subscriber for cache events.

```typescript
import { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { ConfigProvider, Duration, Effect, Layer, Option, PubSub, Queue, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  AppDirs,
  AppDirsConfig,
  ConfigFile,
  ExplicitPath,
  FirstMatch,
  SqliteCache,
  TomlCodec,
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
        // Drain available events
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

[Previous: Building a CLI](./08-building-a-cli.md) | [Next: Error Handling](./10-error-handling.md)
