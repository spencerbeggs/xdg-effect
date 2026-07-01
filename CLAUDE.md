# CLAUDE.md

This file provides guidance to Claude Code when working with code in this
repository.

## Project Overview

Opinionated [Effect](https://effect.website/) library providing composable
layers for XDG Base Directory support, from environment resolution through
config file management to SQLite-backed caching and persistent state.

### Sibling Packages

xdg-effect extracted its ConfigFile and JSON Schema code into standalone
packages. xdg-effect re-exports their public API for single-import
convenience:

- **config-file-effect** (0.3.0) -- ConfigFile, codecs (JSON, TOML,
  Encrypted), resolvers (UpwardWalk subpaths, SystemEtc, etc.), strategies,
  events, migrations, watcher
- **json-schema-effect** (0.3.0) -- JsonSchemaExporter, JsonSchemaValidator,
  JsonSchemaScaffolder, taplo/tombi helpers, JsonSchemaClass

Import from `xdg-effect` for convenience or from the sibling packages
directly. Both work identically at runtime.

### Services

| Service | Purpose |
| ------- | ------- |
| XdgResolver | XDG env var resolution via Effect `Config`; also exposes `appData`/`localAppData` (`APPDATA`/`LOCALAPPDATA`) for native Windows paths |
| AppDirs | App-namespaced directory resolution with 5-level precedence (override -> XDG env -> native -> fallbackDir -> `$HOME/.<ns>`); `native: true` enables the native tier (XDG wins over native; no-op on linux); `ensure*` methods create directories on demand |
| XdgConfigResolver | ConfigResolver that looks for files in the XDG config directory (requires AppDirs) |
| NativeConfigResolver | ConfigResolver for the OS-native config dir (macOS Application Support, Windows APPDATA); native-as-fallback, chain after XdgConfigResolver; requires `FileSystem \| XdgResolver`; no-op on linux |
| XdgSavePath | Default save path resolver for config files in XDG config directory |
| SqliteCache | KV cache with TTL, tags, PubSub observability |
| SqliteState | Managed SQLite with user migrations |

`nativeDirs` is a pure helper (`src/services/NativeDirs.ts`) returning the
`NativeDirs` OS-native path mapping (macOS Application Support/Caches, Windows
APPDATA/LOCALAPPDATA, `Option.none()` on linux). It backs both AppDirs native
mode and NativeConfigResolver.

### Layer Access Pattern

Layer factories live as **static properties on service tags**, not as
standalone exports. Every service also exposes a `.Test` static for
scoped test layers with temp directories.

```typescript
// Core service layers
XdgResolver.Live                        // Layer.Layer<XdgResolver>
AppDirs.Live(config)                    // Layer.Layer<AppDirs, never, XdgResolver | FileSystem>
SqliteCache.Live()                      // Layer.Layer<SqliteCache, never, SqlClient>
SqliteState.Live({ migrations })        // Layer.Layer<SqliteState, never, SqlClient>

// XDG-integrated factories (auto-resolve paths from AppDirs)
SqliteCache.XdgLive({ filename? })      // Layer.Layer<SqliteCache, never, AppDirs>
SqliteState.XdgLive({ migrations, filename? })  // Layer.Layer<SqliteState, never, AppDirs>

// Aggregate layers
XdgLive(appConfig)                      // XdgResolver | AppDirs
XdgConfigLive({ app, config })          // XdgResolver | AppDirs | ConfigFileService<A>
XdgConfigLive.toml({ namespace, filename, tag, schema })  // Preset: TOML codec
XdgConfigLive.json({ namespace, filename, tag, schema })  // Preset: JSON codec
XdgConfigLive.layered({ namespace, filename, tag, schema, codec, projectSubpaths?, native?, system? })
                                        // Full project->user->system search chain
                                        //   (UpwardWalk subpaths -> XdgConfigResolver
                                        //   -> NativeConfigResolver -> SystemEtc); explicit codec
XdgConfigLive.multi({ app, configs })   // Multiple config files, shared XdgLive
XdgFullLive({ app, config, migrations }) // Full stack (XDG + config + SQLite)

// Re-exported from config-file-effect (same static pattern)
ConfigFile.Live<A>(options)             // Layer.Layer<ConfigFileService<A>, never, FileSystem>
ConfigFile.Test<A>(options)             // Pre-populated temp directory

// Re-exported from json-schema-effect
JsonSchemaExporter.Live                 // Layer.Layer<JsonSchemaExporter, never, FileSystem>
JsonSchemaValidator.Live                // Layer.Layer<JsonSchemaValidator>
JsonSchemaScaffolder.Live               // Layer.Layer<JsonSchemaScaffolder, never, FileSystem>

// Test layers (all require Scope)
XdgResolver.Test(options?)              // Scoped temp dirs, no real env vars
AppDirs.Test({ namespace, ... })        // Includes XdgResolver.Test + NodeFileSystem
SqliteCache.Test()                      // In-memory SQLite
SqliteState.Test({ migrations })        // In-memory SQLite
```

### Dependencies

- **Runtime:** `config-file-effect` (^0.3.0), `json-schema-effect` (^0.3.0)
- **Peer (required):** `@effect/platform`, `@effect/platform-node`, `effect`
- **Peer (optional):** `@effect/sql`, `@effect/sql-sqlite-node` (only for
  SqliteCache/SqliteState)
- **Transitive:** `ajv` arrives automatically as a full runtime dependency
  of json-schema-effect (needed only for JsonSchemaValidator); consumers do
  not declare it

### Source Layout

```text
src/
  index.ts              # Barrel export (own code + re-exports from sibling packages)
  errors/               # AppDirsError, CacheError, StateError, XdgError
  layers/               # XdgLive, XdgConfigLive, XdgFullLive, SqliteCache*Live,
                        #   SqliteState*Live, *Test layers, XdgResolverLive/Test
  resolvers/            # XdgConfigResolver, NativeConfigResolver, XdgSavePath
                        #   (bridges to config-file-effect)
  schemas/              # AppDirsConfig, CacheEntry, CacheEvent, MigrationStatus,
                        #   ResolvedAppDirs, XdgPaths
  services/             # XdgResolver, AppDirs, NativeDirs (pure helper),
                        #   SqliteCache, SqliteState
```

### User Documentation

Progressive guides live in `docs/` (01-getting-started through
11-api-reference, with 05-json-schema-advanced covering SchemaStore compat,
helpers, validator, and JsonSchemaClass). Keep these consistent when changing
public API surface, adding services, or modifying layer composition.

### Design Documentation

**For architecture details, layer composition, and design rationale:**
-> `@./.claude/design/xdg-effect/architecture.md`

Load when working on service interfaces, layer wiring, aggregate layer
composition, XDG resolvers, or debugging dependency graph issues.
**Do NOT load unless directly relevant to your task.**

## Build Pipeline

This project uses
[@savvy-web/bundler](https://github.com/savvy-web/systems) (a `tsdown`-based
zero-config bundler) to produce dual build outputs. The self-executing
`savvy.build.ts` calls `build()` and runs against the `dev` or `prod` target:

| Output | Directory | Purpose |
| ------ | --------- | ------- |
| Development | `dist/dev/pkg` | Local link target; `catalog:`/`workspace:` specifiers preserved |
| Production | `dist/prod/<group>/pkg` | Publishable; specifiers resolved; emits API Extractor api-model |

### How `private: true` Works

The source `package.json` is marked `"private": true` — **this is intentional
and correct**. Each build runs a manifest transform (after resolving
`publishConfig.targets`) to produce the published `package.json`. The default
transform strips build- and dev-only fields (`devDependencies`, `scripts`,
`publishConfig`, `devEngines`) so the output is publishable. Never manually set
`"private": false` in the source `package.json`. A custom `transform` in
`savvy.build.ts` replaces the default (re-apply it via `defaultManifestTransform`
if needed); the current build supplies only `meta.tsdoc` config.

### Publish Targets

The `publishConfig.targets` map defines where packages are published; each
distinct name becomes a byte-variant group written to `dist/prod/<group>/pkg`,
with a `dist/prod/targets.json` binding consumed by the release step:

- **npm registry** — `npm: true` (own name)
- **GitHub Packages** — `github: "@spencerbeggs/xdg-effect"` (renamed group)

Both targets publish with provenance attestation enabled.

### Turbo Orchestration

[Turbo](https://turbo.build/) manages build task dependencies and caching:

- `types:check` runs first (no dependencies)
- `build:dev` and `build:prod` both depend on `types:check`
- Cache excludes: `*.md`, `.changeset/**`, `.claude/**`, `.github/**`,
  `.husky/**`, `.vscode/**`
- Environment pass-through: `GITHUB_ACTIONS`, `CI`

## Savvy-Web Tool References

This project depends on several `@savvy-web/*` packages. These are in active
development — if behavior seems unexpected, explore both the GitHub docs and the
installed source.

| Package | Purpose | GitHub | Local Source |
| ------- | ------- | ------ | ------------ |
| bundler | Build pipeline (tsdown), dual output, manifest transform | [savvy-web/systems](https://github.com/savvy-web/systems) | `node_modules/@savvy-web/bundler/` |
| commitlint | Conventional commit + DCO enforcement | [savvy-web/commitlint](https://github.com/savvy-web/commitlint) | `node_modules/@savvy-web/commitlint/` |
| changesets | Versioning, changelogs, release management | [savvy-web/changesets](https://github.com/savvy-web/changesets) | `node_modules/@savvy-web/changesets/` |
| lint-staged | Pre-commit file linting via Biome | [savvy-web/lint-staged](https://github.com/savvy-web/lint-staged) | `node_modules/@savvy-web/lint-staged/` |
| vitest | Vitest config factory with project support | [savvy-web/vitest](https://github.com/savvy-web/vitest) | `node_modules/@savvy-web/vitest/` |

TypeScript configuration extends from the bundler:
`@savvy-web/bundler/tsconfig/ecma.json`

## Commands

### Development

```bash
pnpm run lint              # Check code with Biome
pnpm run lint:fix          # Auto-fix lint issues
pnpm run lint:fix:unsafe   # Auto-fix including unsafe transforms
pnpm run lint:md           # Check markdown with markdownlint
pnpm run lint:md:fix       # Auto-fix markdown issues
pnpm run typecheck         # Type-check via Turbo (runs tsgo)
pnpm run test              # Run all tests
pnpm run test:watch        # Run tests in watch mode
pnpm run test:coverage     # Run tests with v8 coverage report
```

### Building

```bash
pnpm run build             # Build dev + prod outputs via Turbo
pnpm run build:dev         # Build development output only
pnpm run build:prod        # Build production output only
```

### Running a Specific Test

```bash
pnpm vitest run __test__/json-schema-exporter.test.ts
```

## Code Quality and Hooks

### Biome

Unified linter and formatter replacing ESLint + Prettier. Configuration in
`biome.jsonc` extends `@savvy-web/silk/biome`.

### Commitlint

Enforces conventional commit format with DCO signoff. Configuration in
`lib/configs/commitlint.config.ts` uses the `CommitlintConfig.silk()` preset.

### Husky Git Hooks

| Hook | Action |
| ---- | ------ |
| `pre-commit` | Runs lint-staged (Biome on staged files) |
| `commit-msg` | Validates commit message format via commitlint |
| `pre-push` | Runs tests for affected packages using Turbo |
| `post-checkout` | Package manager setup |
| `post-merge` | Package manager setup |

### Lint-Staged

Configuration in `lib/configs/lint-staged.config.ts` uses the `Preset.silk()`
preset from `@savvy-web/lint-staged`.

## Conventions

### Imports

- Use `.js` extensions for relative imports (ESM requirement)
- Use `node:` protocol for Node.js built-ins (e.g., `import fs from 'node:fs'`)
- Separate type imports: `import type { Foo } from './bar.js'`

### Commits

All commits require:

1. Conventional commit format (`feat`, `fix`, `chore`, etc.)
2. DCO signoff: `Signed-off-by: Name <email>`

### Publishing

Packages publish to both GitHub Packages and npm with provenance via the
[@savvy-web/changesets](https://github.com/savvy-web/changesets) release
workflow. The GitHub Action is at
[savvy-web/silk-release-action](https://github.com/savvy-web/silk-release-action).

## Testing

- **Framework**: [Vitest](https://vitest.dev/) with v8 coverage provider
- **Pool**: Uses `forks` (not threads) for broader compatibility
- **Config**: `vitest.config.ts` uses the `VitestConfig.create()` factory from
  `@savvy-web/vitest`, which supports project-based filtering via `--project`
- **CI**: `pnpm run ci:test` sets `CI=true` and enables coverage
