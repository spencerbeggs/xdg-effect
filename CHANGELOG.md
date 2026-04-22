# xdg-effect

## 0.3.1

### Bug Fixes

* [`5f26fa3`](https://github.com/spencerbeggs/xdg-effect/commit/5f26fa367fb2f68ec496234e2ce3842f27cb36bd) Register x-tombi-\* keywords with Ajv during validation

## 0.3.0

### Features

* [`1020f61`](https://github.com/spencerbeggs/xdg-effect/commit/1020f6187a679f8b720a30ae0af2a13fe8a9d05e) **`Jsonifiable` schema** — Drop-in replacement for `Schema.Unknown` in JSON Schema generation contexts. Unlike `Schema.Unknown`, it emits an empty schema (`{}`), which Ajv strict mode accepts as "any valid JSON instance" without producing `$id: "/schemas/unknown"` artifacts.

* **`JsonSchemaExporter` cleanup pass** — The exporter now automatically strips three classes of noise from generated schemas before writing: `$id: "/schemas/unknown"` artifacts (and their accompanying `title`), empty `required` arrays, and empty `properties` objects on Record-typed nodes. Existing callers receive cleaner output with no API changes.

* **`SchemaEntry.$id` field** — `SchemaEntry` accepts an optional `$id` field. When present, the generated schema receives a top-level `$id` written in the SchemaStore URL convention, enabling IDE schema association without extra post-processing.

* **`JsonSchemaValidator` service** — New opt-in service backed by Ajv that validates generated schemas before they are written to disk. Requires the optional peer dependency `ajv >= 8.0.0`.

  ```ts
  const program = Effect.gen(function* () {
    const exporter = yield* JsonSchemaExporter;
    const validator = yield* JsonSchemaValidator;

    const output = yield* exporter.generate(MyConfig.schemaEntry);
    yield* validator.validate(output, { strict: true });
  });

  program.pipe(
    Effect.provide(JsonSchemaExporter.Live),
    Effect.provide(JsonSchemaValidator.Live),
  );
  ```

  The `strict` option enables both Ajv strict mode and a Tombi compatibility check that flags any `object` schema with `properties` but no `additionalProperties`, which Tombi treats as a closed object.

* **`JsonSchemaValidationError`** — New tagged error (`"JsonSchemaValidationError"`) raised by `JsonSchemaValidator`. Carries the schema `name` and a `ReadonlyArray<string>` of human-readable error descriptions. Handle selectively with `Effect.catchTag("JsonSchemaValidationError", ...)`.

* **`tombi()` annotation helper** — Typed builder for `x-tombi-*` JSON Schema extensions. Accepts a `TombiOptions` object and returns a flat record of `x-tombi-*` keys for use in `SchemaEntry.annotations` or Effect Schema `jsonSchema` annotations. Compose with `taplo()` via object spread.

  ```ts
  import { tombi, taplo } from "xdg-effect";

  const annotations = {
    ...tombi({ tableKeysOrder: "schema", tomlVersion: "v1.0.0" }),
    ...taplo({ initKeys: ["name", "version"] }),
  };
  ```

* **`taplo()` annotation helper** — Typed builder for the `x-taplo` JSON Schema extension. Accepts a `TaploOptions` object (supporting `hidden`, `docs`, `links`, `initKeys`, and `custom`) and returns `{ "x-taplo": { ... } }`.

* **`JsonSchemaClass` factory** — `Schema.Class` wrapper that co-locates a schema's `$id` URL with its field definitions and generates convenience statics (`$id`, `schemaEntry`, `toJson`, `validate`) for the SchemaStore integration workflow.

  ```ts
  class AppConfig extends JsonSchemaClass<AppConfig>("AppConfig", {
    $id: "https://json.schemastore.org/app-config.json",
  })({
    name: Schema.String,
    port: Schema.Number,
  }) {}

  // Use with the exporter directly
  const output = yield * exporter.generate(AppConfig.schemaEntry);

  // Encode an instance with $schema injected
  const json =
    yield * AppConfig.toJson(new AppConfig({ name: "app", port: 3000 }));

  // Decode and validate unknown input
  const config = yield * AppConfig.validate(rawInput);
  ```

### Dependencies

* | [`1020f61`](https://github.com/spencerbeggs/xdg-effect/commit/1020f6187a679f8b720a30ae0af2a13fe8a9d05e) | Dependency     | Type  | Action | From  | To |
  | :------------------------------------------------------------------------------------------------------ | :------------- | :---- | :----- | :---- | -- |
  | ajv                                                                                                     | peerDependency | added | —      | 8.0.0 |    |

## 0.2.0

### Breaking Changes

* [`59a9b36`](https://github.com/spencerbeggs/xdg-effect/commit/59a9b36064064bd13dda73e4ab5485cfe1d27908) All six layer factories have moved from standalone exports to static properties on their service tag classes. Import and compose layers via the service tag instead of named layer exports:

  ```ts
  // Before
  import { AppDirsLive, XdgResolverLive } from "xdg-effect";

  // After
  import { AppDirs, XdgResolver } from "xdg-effect";
  AppDirs.Live;
  XdgResolver.Live;
  ```

  Affected services: `AppDirs`, `XdgResolver`, `JsonSchemaExporter`, `SqliteCache`, `SqliteState`, and `ConfigFile`.

* `ConfigFile` is now a plain namespace object (`{ Tag, Live, Test }`) rather than a class. The former `makeConfigFileTag` and `makeConfigFileLive` helpers are removed; use `ConfigFile.Tag` and `ConfigFile.Live` instead:

  ```ts
  // Before
  import { makeConfigFileTag, makeConfigFileLive } from "xdg-effect";
  const MyConfig = makeConfigFileTag<Config>("my-app");
  const layer = makeConfigFileLive(MyConfig, options);

  // After
  import { ConfigFile } from "xdg-effect";
  const MyConfig = ConfigFile.Tag<Config>("my-app");
  const layer = ConfigFile.Live(options).pipe(Layer.provide(...));
  ```

* Standalone layer exports (`AppDirsLive`, `XdgResolverLive`, etc.) are removed from the barrel. All layer composition now goes through service tag statics.

### Features

* [`59a9b36`](https://github.com/spencerbeggs/xdg-effect/commit/59a9b36064064bd13dda73e4ab5485cfe1d27908) `AppDirsConfig` now accepts a minimal `{ namespace }` constructor. The `fallbackDir` and `dirs` fields are optional and default to `Option.none()`, eliminating the need to supply empty option values when creating a basic config.

* `AppDirsService` gains four directory-ensuring methods that resolve the path and create the directory if it does not exist: `ensureConfig`, `ensureData`, `ensureCache`, and `ensureState`. Each returns `Effect<string, AppDirsError>`.

* `ConfigFileService` gains three new methods:
  * `loadOrDefault(defaultValue: A)` — loads the config file, returning `defaultValue` if no file is found rather than failing.
  * `save(value: A)` — writes `value` to the path specified by `defaultPath` in `ConfigFileOptions`.
  * `update(fn, defaultValue?)` — loads (or falls back to `defaultValue`), applies `fn`, saves the result, and returns the updated value.

* `ConfigFileOptions` has a new optional `defaultPath` field (accepts a plain string or an `Effect<string, ConfigError, AppDirs>`). Required by `save` and `update`.

* New `XdgSavePath(filename)` resolver helper builds a `defaultPath` effect that resolves to `<xdgConfigDir>/<filename>`, intended for use with the `defaultPath` option in `ConfigFileOptions`.

* All six services now expose a `Test` static that provides a scoped in-memory or temp-directory layer suitable for unit tests, with automatic cleanup on scope close:
  * `AppDirs.Test` — mounts a scoped temp directory tree
  * `XdgResolver.Test` — resolves configurable in-memory XDG paths
  * `ConfigFile.Test` — pre-populates files in a scoped temp directory
  * `JsonSchemaExporter.Test` — scoped temp directory for schema output
  * `SqliteCache.Test` — in-memory SQLite cache
  * `SqliteState.Test` — in-memory SQLite state store

### Bug Fixes

* [`59a9b36`](https://github.com/spencerbeggs/xdg-effect/commit/59a9b36064064bd13dda73e4ab5485cfe1d27908) `XdgResolverLive` and `JsonSchemaExporterLive` are now factory functions rather than eagerly-evaluated layer values, resolving ESM circular import errors that surfaced when importing from certain bundler entry points.

## 0.1.0

### Features

* [`8c56d48`](https://github.com/spencerbeggs/xdg-effect/commit/8c56d484cb1ce04c0e019a5ebd5d1a67f77e5edb) ### XDG Base Directory Support

Opinionated Effect library providing composable layers for XDG Base Directory support, from environment resolution through config file management to SQLite-backed caching and persistent state.

### Documentation

* [`8c56d48`](https://github.com/spencerbeggs/xdg-effect/commit/8c56d484cb1ce04c0e019a5ebd5d1a67f77e5edb) README with installation, quick-start example, progressive adoption table, and complete API export tables
* 10 progressive guides in `docs/` covering all services, codecs, resolvers, strategies, error handling, testing patterns, and `@effect/cli` integration
* Runnable TypeScript code examples throughout, with inline API references

### Services

* **XdgResolver** — Reads XDG Base Directory environment variables (`XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `XDG_STATE_HOME`, `XDG_RUNTIME_DIR`) via Effect's `Config` module. Each variable resolves to an `Option`, with `HOME` returned as a required string.
* **AppDirs** — Resolves app-namespaced directories with a four-level precedence chain: explicit override > XDG env var + namespace > `fallbackDir` > `$HOME/.namespace`. Includes an `ensure()` method that creates directories on demand.
* **ConfigFile** — Generic config file loading with pluggable codecs (`JsonCodec`, `TomlCodec`), composable resolvers (`ExplicitPath`, `StaticDir`, `UpwardWalk`, `XdgConfig`, `WorkspaceRoot`), and two merge strategies (`FirstMatch`, `LayeredMerge`).
* **JsonSchemaExporter** — Build-time helper that generates JSON Schema from Effect Schemas. Inlines root `$ref` for Tombi LSP compatibility, supports `x-tombi` annotations, and uses deep-equal diffing to skip unchanged file writes.
* **SqliteCache** — Key/value cache backed by SQLite via `@effect/sql`. Supports TTL-based expiry, tag-based invalidation, manual purging, and PubSub observability events.
* **SqliteState** — Managed SQLite database with numbered user-defined migrations (up/down), auto-migration on construction, rollback support, and raw `SqlClient` access.

### Aggregate Layers

Three pre-composed layers for progressive adoption:

* `XdgLive` — Provides `XdgResolver` + `AppDirs`
* `XdgConfigLive` — Extends `XdgLive` with `ConfigFile`
* `XdgFullLive` — Extends `XdgConfigLive` with `SqliteCache` and `SqliteState`

### Error Handling

Seven tagged error types using the `Data.TaggedError` pattern: `XdgError`, `AppDirsError`, `CodecError`, `ConfigError`, `JsonSchemaError`, `CacheError`, and `StateError`. All share the `XdgEffectError` union type for catch-all handling.
