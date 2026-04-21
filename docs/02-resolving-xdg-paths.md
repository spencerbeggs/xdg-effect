# Resolving XDG Paths

The foundation of any XDG-aware application is knowing where to put files. xdg-effect provides two services for this: `XdgResolver` reads raw environment variables, and `AppDirs` resolves them into concrete, app-namespaced directory paths.

## XDG Base Directory Specification

The [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir-spec/latest/) defines standard locations for user-specific application files. Instead of scattering `~/.myapp` directories everywhere, XDG gives each type of data a designated home:

| Variable | Purpose | Default fallback |
| -------- | ------- | ---------------- |
| `XDG_CONFIG_HOME` | User configuration files | `~/.config` |
| `XDG_DATA_HOME` | User data files | `~/.local/share` |
| `XDG_CACHE_HOME` | Non-essential cached data | `~/.cache` |
| `XDG_STATE_HOME` | Persistent state (logs, history) | `~/.local/state` |
| `XDG_RUNTIME_DIR` | Runtime files (sockets, pipes) | None (system-assigned) |

`HOME` is the only required variable — all XDG paths are derived from it. `XDG_RUNTIME_DIR` has no fallback because it is assigned by the login session (for example, by systemd on Linux); it may not exist on all systems.

When an XDG variable is not set, XDG-compliant applications are expected to fall back to the default path listed above. xdg-effect's `AppDirs` service resolves directories using a 4-level precedence model described below. Note that it does NOT apply the XDG default paths when variables are unset — see the design note in the AppDirs section for details.

> **Effect concept: Schema classes and Option** — Throughout this guide, constructors like `new AppDirsConfig({ namespace: "my-tool" })` use Effect Schema classes, which accept plain JavaScript objects. Fields typed as `Option<T>` represent values that may or may not be present: `Option.some(value)` means a value exists, and `Option.none()` means it is absent. You do not construct `Option` values directly when passing config — omit or pass `undefined` for optional fields and the library wraps them for you. See the [Effect Schema docs](https://effect.website/docs/schema/introduction) for a deeper introduction.

## XdgResolver

`XdgResolver` is the lowest-level service. It reads the five XDG environment variables and `HOME` through Effect's `Config` module, returning each as a typed Effect value.

### Why Config instead of process.env

Reading environment variables through `Config` rather than `process.env` directly makes `XdgResolver` fully testable. In tests, you swap in a `ConfigProvider.fromMap()` to control every input without touching the real environment — no global mutation, no `vi.stubEnv`, and no cleanup between tests.

### The Option pattern

All directories except `home` return `Option<string>`. When the environment variable is not set, the service returns `Option.none()`. When it is set, it returns `Option.some(value)`. Your application code then decides what to do with the absence — either applying an XDG default or delegating to `AppDirs`, which handles it automatically.

`home` is required: it returns `Effect<string, XdgError>` and fails if `HOME` is unset.

### XdgResolverService interface

```typescript
interface XdgResolverService {
  readonly configHome: Effect.Effect<Option.Option<string>>;
  readonly dataHome: Effect.Effect<Option.Option<string>>;
  readonly cacheHome: Effect.Effect<Option.Option<string>>;
  readonly stateHome: Effect.Effect<Option.Option<string>>;
  readonly runtimeDir: Effect.Effect<Option.Option<string>>;
  readonly home: Effect.Effect<string, XdgError>;
  readonly resolveAll: Effect.Effect<XdgPaths, XdgError>;
}
```

Use `resolveAll` to batch-read all paths in a single effect, which returns an `XdgPaths` value:

### XdgPaths schema fields

| Field | Type | Notes |
| ----- | ---- | ----- |
| `home` | `string` | Required, fails if `HOME` is unset |
| `configHome` | `Option<string>` | `XDG_CONFIG_HOME` if set |
| `dataHome` | `Option<string>` | `XDG_DATA_HOME` if set |
| `cacheHome` | `Option<string>` | `XDG_CACHE_HOME` if set |
| `stateHome` | `Option<string>` | `XDG_STATE_HOME` if set |
| `runtimeDir` | `Option<string>` | `XDG_RUNTIME_DIR` if set |

## AppDirs

`AppDirs` builds on `XdgResolver` to produce concrete, namespaced directory paths for your application. Instead of receiving `Option<string>` and computing fallbacks yourself, `AppDirs` applies a consistent precedence model and returns plain strings for every directory type (except `runtime`, which remains `Option<string>` because there is no universal fallback).

### 4-level precedence

For each directory type (config, data, cache, state), `AppDirs` resolves the path using this order:

1. **Explicit override** — if `AppDirsConfig.dirs` contains a value for that directory (e.g., `{ config: "/etc/my-tool" }`), it is used as-is, bypassing XDG resolution entirely
2. **XDG env var + namespace** — if the corresponding XDG variable is set, the namespace is appended (e.g., `$XDG_CONFIG_HOME/my-tool`)
3. **Fallback directory under HOME** — if `AppDirsConfig.fallbackDir` is set, that path under `HOME` is used for all directory types (e.g., `$HOME/.config-alt` — note that the namespace is NOT appended at this level)
4. **Default** — `$HOME/.my-tool`

> **Important:** Unlike the XDG spec, xdg-effect does NOT use per-type defaults (`~/.config`, `~/.local/share`, etc.) when XDG variables are unset. Instead, all directory types collapse to `$HOME/.<namespace>`. If you need XDG-spec-compliant defaults, use explicit `dirs` overrides in your `AppDirsConfig`.

### ensure creates directories

Calling `appDirs.ensure` resolves all paths and creates the directories on disk if they do not already exist, including any necessary parent directories. It returns the same `ResolvedAppDirs` value as `resolveAll`.

### AppDirsService interface

```typescript
interface AppDirsService {
  readonly config: Effect.Effect<string, AppDirsError>;
  readonly data: Effect.Effect<string, AppDirsError>;
  readonly cache: Effect.Effect<string, AppDirsError>;
  readonly state: Effect.Effect<string, AppDirsError>;
  readonly runtime: Effect.Effect<Option.Option<string>, AppDirsError>;
  readonly ensureConfig: Effect.Effect<string, AppDirsError>;
  readonly ensureData: Effect.Effect<string, AppDirsError>;
  readonly ensureCache: Effect.Effect<string, AppDirsError>;
  readonly ensureState: Effect.Effect<string, AppDirsError>;
  readonly resolveAll: Effect.Effect<ResolvedAppDirs, AppDirsError>;
  readonly ensure: Effect.Effect<ResolvedAppDirs, AppDirsError>;
}
```

The `ensure*` methods resolve and create a single directory type on disk (including parent directories), returning the resolved path. Use them when you only need one specific directory created rather than all of them:

```typescript
const configDir = yield* appDirs.ensureConfig;
// e.g., /home/user/.config/my-tool (created if it did not exist)
```

**When to use `ensureConfig` vs `ensure`:**

- Use `ensureConfig` (or `ensureData`, `ensureCache`, `ensureState`) when you only need one directory before performing an operation — for example, ensuring the config directory exists before writing a config file. This avoids creating data, cache, and state directories unnecessarily.
- Use `ensure` when your app needs all directories available at startup.
- Per-directory ensure is especially useful in tests where creating all directories may fail or have side effects if paths are mocked or restricted.

### AppDirsConfig schema

Pass an `AppDirsConfig` to the layer factory to configure namespace and optional overrides. Because the schema uses `Schema.OptionFromUndefinedOr`, you construct it with plain JavaScript objects — omit a field or pass `undefined` and the library wraps it in `Option` internally.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `namespace` | `string` | Required, appended to XDG paths |
| `fallbackDir` | `string \| undefined` | Optional fallback path under `HOME` |
| `dirs` | `object \| undefined` | Optional per-directory overrides |
| `dirs.config` | `string \| undefined` | Override for the config directory |
| `dirs.data` | `string \| undefined` | Override for the data directory |
| `dirs.cache` | `string \| undefined` | Override for the cache directory |
| `dirs.state` | `string \| undefined` | Override for the state directory |
| `dirs.runtime` | `string \| undefined` | Override for the runtime directory |

### ResolvedAppDirs schema

| Field | Type | Notes |
| ----- | ---- | ----- |
| `config` | `string` | Resolved config directory path |
| `data` | `string` | Resolved data directory path |
| `cache` | `string` | Resolved cache directory path |
| `state` | `string` | Resolved state directory path |
| `runtime` | `Option<string>` | Runtime directory if available |

## XdgLive aggregate layer

`XdgLive` composes `XdgResolver.Live` and `AppDirs.Live(config)` into a single layer. Use it when your program needs both services and you do not want to wire them manually.

```typescript
XdgLive(config: AppDirsConfig): Layer<XdgResolver | AppDirs, never, FileSystem>
```

`XdgLive` requires `FileSystem` from `@effect/platform` because `AppDirs.Live` uses it for directory creation in `ensure`. You provide the platform's `FileSystem` layer (for example, `NodeFileSystem.layer`) separately.

## Runnable example

The following program resolves and creates all application directories for `my-tool`:

```typescript
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Option } from "effect";
import { AppDirs, AppDirsConfig, XdgLive } from "xdg-effect";

const program = Effect.gen(function* () {
  const appDirs = yield* AppDirs;

  // Resolve individual directories
  const configDir = yield* appDirs.config;
  console.log("Config:", configDir);
  // e.g., /home/user/.config/my-tool

  const dataDir = yield* appDirs.data;
  console.log("Data:", dataDir);

  // Resolve and create all directories at once
  const dirs = yield* appDirs.ensure;
  console.log("All dirs created:", dirs);

  // Runtime dir is optional (only available on some systems)
  if (Option.isSome(dirs.runtime)) {
    console.log("Runtime:", dirs.runtime.value);
  }
});

const layer = XdgLive(new AppDirsConfig({ namespace: "my-tool" }));

Effect.runPromise(
  program.pipe(Effect.provide(layer), Effect.provide(NodeFileSystem.layer)),
);
```

With `XDG_CONFIG_HOME` unset, `config` resolves to `$HOME/.my-tool`. If `XDG_CONFIG_HOME=/home/user/.config` is set, it resolves to `/home/user/.config/my-tool`.

## Overriding directories

Pass a `dirs` object to `AppDirsConfig` to override specific paths entirely. Explicit overrides skip XDG resolution for those directories — the path is used as provided, regardless of any environment variables:

```typescript
const layer = XdgLive(
  new AppDirsConfig({
    namespace: "my-tool",
    dirs: {
      config: "/etc/my-tool",
      data: "/var/lib/my-tool",
    },
  }),
);
```

In this example, `config` and `data` always resolve to the given paths. `cache`, `state`, and `runtime` still follow the normal 4-level precedence using the `my-tool` namespace.

---

[Previous: Getting Started](./01-getting-started.md) | [Next: Config Files](./03-config-files.md)
