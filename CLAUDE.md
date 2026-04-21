# CLAUDE.md

This file provides guidance to Claude Code when working with code in this
repository.

## Project Overview

Opinionated [Effect](https://effect.website/) library providing composable
layers for XDG Base Directory support, from environment resolution through
config file management to SQLite-backed caching and persistent state.

### Services

| Service | Purpose |
| ------- | ------- |
| XdgResolver | XDG env var resolution via Effect `Config` |
| AppDirs | App-namespaced directory resolution with 4-level precedence; `ensure*` methods create directories on demand |
| ConfigFile | Pluggable config loading with `loadOrDefault`, `save`, `update` convenience methods |
| JsonSchemaExporter | JSON Schema generation with Tombi annotation support |
| SqliteCache | KV cache with TTL, tags, PubSub observability |
| SqliteState | Managed SQLite with user migrations |

### Layer Access Pattern

Layer factories live as **static properties on service tags**, not as
standalone exports. Every service also exposes a `.Test` static for
scoped test layers with temp directories.

```typescript
// Live layers
XdgResolver.Live                        // Layer.Layer<XdgResolver>
AppDirs.Live(config)                    // Layer.Layer<AppDirs, never, XdgResolver | FileSystem>
ConfigFile.Tag<A>(id)                   // Context.GenericTag for parameterized service
ConfigFile.Live<A>(options)             // Layer.Layer<ConfigFileService<A>, never, FileSystem>
JsonSchemaExporter.Live                 // Layer.Layer<JsonSchemaExporter, never, FileSystem>
SqliteCache.Live()                      // Layer.Layer<SqliteCache, never, SqlClient>
SqliteState.Live({ migrations })        // Layer.Layer<SqliteState, never, SqlClient>

// Test layers (all require Scope)
XdgResolver.Test(options?)              // Scoped temp dirs, no real env vars
AppDirs.Test({ namespace, ... })        // Includes XdgResolver.Test + NodeFileSystem
ConfigFile.Test<A>(options)             // Pre-populated temp directory
JsonSchemaExporter.Test                 // Scoped temp directory
SqliteCache.Test()                      // In-memory SQLite
SqliteState.Test({ migrations })        // In-memory SQLite
```

**Removed exports (pre-0.2):** `AppDirsLive`, `XdgResolverLive`,
`JsonSchemaExporterLive`, `makeSqliteCacheLive`, `makeSqliteStateLive`,
`makeConfigFileTag`, `makeConfigFileLive` -- use the service tag statics
above instead.

### Dependencies

- **Runtime:** `effect`, `@effect/platform`, `smol-toml`
- **Peer (required):** `@effect/platform`, `@effect/platform-node`, `effect`
- **Peer (optional):** `@effect/sql`, `@effect/sql-sqlite-node` (only for
  SqliteCache/SqliteState)

### Source Layout

```text
src/
  index.ts              # Single barrel export
  codecs/               # Pluggable config file format parsers (JSON, TOML)
  errors/               # Data.TaggedError types with Base exports
  layers/               # Layer implementations (*Live.ts and *Test.ts)
  resolvers/            # Config file location strategies (5 built-in + XdgSavePath)
  schemas/              # Effect Schema classes (data shapes)
  services/             # Context.Tag service interfaces (with .Live/.Test statics)
  strategies/           # Config resolution merge strategies
```

### User Documentation

Progressive guides live in `docs/` (01-getting-started through
10-api-reference). Keep these consistent when changing public API surface,
adding services, or modifying layer composition.

### Design Documentation

**For architecture details, layer composition, and design rationale:**
-> `@./.claude/design/xdg-effect/architecture.md`

Load when working on service interfaces, layer wiring, adding new
codecs/resolvers/strategies, or debugging dependency graph issues.

## Build Pipeline

This project uses
[@savvy-web/rslib-builder](https://github.com/savvy-web/rslib-builder) to
produce dual build outputs via [Rslib](https://rslib.rs/):

| Output | Directory | Purpose |
| ------ | --------- | ------- |
| Development | `dist/dev/` | Local development with source maps |
| Production | `dist/npm/` | Published to npm and GitHub Packages |

### How `private: true` Works

The source `package.json` is marked `"private": true` — **this is intentional
and correct**. During the build, rslib-builder reads the `publishConfig` field
and transforms the output `package.json`:

- Sets `"private": false` based on `publishConfig.access`
- Rewrites `exports` to point at compiled output
- Strips `devDependencies`, `scripts`, `publishConfig`, and `devEngines`

The `rslib.config.ts` `transform()` callback controls what gets removed. Never
manually set `"private": false` in the source `package.json`.

### Publish Targets

The `publishConfig.targets` array defines where packages are published:

- **GitHub Packages** — `https://npm.pkg.github.com/` (from `dist/npm/`)
- **npm registry** — `https://registry.npmjs.org/` (from `dist/npm/`)

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
| rslib-builder | Build pipeline, dual output, package.json transform | [savvy-web/rslib-builder](https://github.com/savvy-web/rslib-builder) | `node_modules/@savvy-web/rslib-builder/` |
| commitlint | Conventional commit + DCO enforcement | [savvy-web/commitlint](https://github.com/savvy-web/commitlint) | `node_modules/@savvy-web/commitlint/` |
| changesets | Versioning, changelogs, release management | [savvy-web/changesets](https://github.com/savvy-web/changesets) | `node_modules/@savvy-web/changesets/` |
| lint-staged | Pre-commit file linting via Biome | [savvy-web/lint-staged](https://github.com/savvy-web/lint-staged) | `node_modules/@savvy-web/lint-staged/` |
| vitest | Vitest config factory with project support | [savvy-web/vitest](https://github.com/savvy-web/vitest) | `node_modules/@savvy-web/vitest/` |

TypeScript configuration extends from rslib-builder:
`@savvy-web/rslib-builder/tsconfig/ecma/lib.json`

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
pnpm run build:prod        # Build production/npm output only
pnpm run build:inspect     # Inspect production build config (verbose)
```

### Running a Specific Test

```bash
pnpm vitest run src/index.test.ts
```

## Code Quality and Hooks

### Biome

Unified linter and formatter replacing ESLint + Prettier. Configuration in
`biome.jsonc` extends `@savvy-web/lint-staged/biome/silk.jsonc`.

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
[savvy-web/workflow-release-action](https://github.com/savvy-web/workflow-release-action).

## Testing

- **Framework**: [Vitest](https://vitest.dev/) with v8 coverage provider
- **Pool**: Uses `forks` (not threads) for broader compatibility
- **Config**: `vitest.config.ts` uses the `VitestConfig.create()` factory from
  `@savvy-web/vitest`, which supports project-based filtering via `--project`
- **CI**: `pnpm run ci:test` sets `CI=true` and enables coverage
