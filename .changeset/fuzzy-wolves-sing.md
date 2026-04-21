---
"xdg-effect": minor
---

## Breaking Changes

- All six layer factories have moved from standalone exports to static properties on their service tag classes. Import and compose layers via the service tag instead of named layer exports:

  ```ts
  // Before
  import { AppDirsLive, XdgResolverLive } from "xdg-effect";

  // After
  import { AppDirs, XdgResolver } from "xdg-effect";
  AppDirs.Live;
  XdgResolver.Live;
  ```

  Affected services: `AppDirs`, `XdgResolver`, `JsonSchemaExporter`, `SqliteCache`, `SqliteState`, and `ConfigFile`.

- `ConfigFile` is now a plain namespace object (`{ Tag, Live, Test }`) rather than a class. The former `makeConfigFileTag` and `makeConfigFileLive` helpers are removed; use `ConfigFile.Tag` and `ConfigFile.Live` instead:

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

- Standalone layer exports (`AppDirsLive`, `XdgResolverLive`, etc.) are removed from the barrel. All layer composition now goes through service tag statics.

## Features

- `AppDirsConfig` now accepts a minimal `{ namespace }` constructor. The `fallbackDir` and `dirs` fields are optional and default to `Option.none()`, eliminating the need to supply empty option values when creating a basic config.

- `AppDirsService` gains four directory-ensuring methods that resolve the path and create the directory if it does not exist: `ensureConfig`, `ensureData`, `ensureCache`, and `ensureState`. Each returns `Effect<string, AppDirsError>`.

- `ConfigFileService` gains three new methods:
  - `loadOrDefault(defaultValue: A)` — loads the config file, returning `defaultValue` if no file is found rather than failing.
  - `save(value: A)` — writes `value` to the path specified by `defaultPath` in `ConfigFileOptions`.
  - `update(fn, defaultValue?)` — loads (or falls back to `defaultValue`), applies `fn`, saves the result, and returns the updated value.

- `ConfigFileOptions` has a new optional `defaultPath` field (accepts a plain string or an `Effect<string, ConfigError, AppDirs>`). Required by `save` and `update`.

- New `XdgSavePath(filename)` resolver helper builds a `defaultPath` effect that resolves to `<xdgConfigDir>/<filename>`, intended for use with the `defaultPath` option in `ConfigFileOptions`.

- All six services now expose a `Test` static that provides a scoped in-memory or temp-directory layer suitable for unit tests, with automatic cleanup on scope close:
  - `AppDirs.Test` — mounts a scoped temp directory tree
  - `XdgResolver.Test` — resolves configurable in-memory XDG paths
  - `ConfigFile.Test` — pre-populates files in a scoped temp directory
  - `JsonSchemaExporter.Test` — scoped temp directory for schema output
  - `SqliteCache.Test` — in-memory SQLite cache
  - `SqliteState.Test` — in-memory SQLite state store

## Bug Fixes

- `XdgResolverLive` and `JsonSchemaExporterLive` are now factory functions rather than eagerly-evaluated layer values, resolving ESM circular import errors that surfaced when importing from certain bundler entry points.
