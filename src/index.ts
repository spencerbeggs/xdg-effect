/**
 * xdg-effect
 *
 * Opinionated Effect library for XDG Base Directory support with progressive
 * layers from path resolution through config management to SQLite-backed
 * caching and state.
 *
 * @packageDocumentation
 */

// ── Codecs ──────────────────────────────────────────────────────────────────
export type { ConfigCodec } from "./codecs/ConfigCodec.js";
export { JsonCodec } from "./codecs/JsonCodec.js";
export { TomlCodec } from "./codecs/TomlCodec.js";
// ── Errors ──────────────────────────────────────────────────────────────────
export { AppDirsError, AppDirsErrorBase } from "./errors/AppDirsError.js";
export { CacheError, CacheErrorBase } from "./errors/CacheError.js";
export { CodecError, CodecErrorBase } from "./errors/CodecError.js";
export { ConfigError, ConfigErrorBase } from "./errors/ConfigError.js";
export {
	JsonSchemaError,
	JsonSchemaErrorBase,
} from "./errors/JsonSchemaError.js";
export { StateError, StateErrorBase } from "./errors/StateError.js";
export type { XdgEffectError } from "./errors/types.js";
export { XdgError, XdgErrorBase } from "./errors/XdgError.js";
// ── Layers ──────────────────────────────────────────────────────────────────
export { AppDirsLive } from "./layers/AppDirsLive.js";
export type { ConfigFileOptions } from "./layers/ConfigFileLive.js";
export { makeConfigFileLive } from "./layers/ConfigFileLive.js";
export { JsonSchemaExporterLive } from "./layers/JsonSchemaExporterLive.js";
export { makeSqliteCacheLive } from "./layers/SqliteCacheLive.js";
export { makeSqliteStateLive } from "./layers/SqliteStateLive.js";
export type { XdgConfigLiveOptions } from "./layers/XdgConfigLive.js";
export { XdgConfigLive } from "./layers/XdgConfigLive.js";
export type { XdgFullLiveOptions } from "./layers/XdgFullLive.js";
export { XdgFullLive } from "./layers/XdgFullLive.js";
export { XdgLive } from "./layers/XdgLive.js";
export { XdgResolverLive } from "./layers/XdgResolverLive.js";
// ── Resolvers ───────────────────────────────────────────────────────────────
export type { ConfigResolver } from "./resolvers/ConfigResolver.js";
export { ExplicitPath } from "./resolvers/ExplicitPath.js";
export { StaticDir } from "./resolvers/StaticDir.js";
export { UpwardWalk } from "./resolvers/UpwardWalk.js";
export { WorkspaceRoot } from "./resolvers/WorkspaceRoot.js";
export { XdgConfig } from "./resolvers/XdgConfig.js";
// ── Schemas ─────────────────────────────────────────────────────────────────
export { AppDirsConfig } from "./schemas/AppDirsConfig.js";
export { CacheEntry } from "./schemas/CacheEntry.js";
export { CacheEvent, CacheEventPayload } from "./schemas/CacheEvent.js";
export { MigrationStatus } from "./schemas/MigrationStatus.js";
export { ResolvedAppDirs } from "./schemas/ResolvedAppDirs.js";
export type { WriteResult } from "./schemas/WriteResult.js";
export { Unchanged, Written } from "./schemas/WriteResult.js";
export { XdgPaths } from "./schemas/XdgPaths.js";
// ── Services ────────────────────────────────────────────────────────────────
export type { AppDirsService } from "./services/AppDirs.js";
export { AppDirs } from "./services/AppDirs.js";
export type { ConfigFileService } from "./services/ConfigFile.js";
export { makeConfigFileTag } from "./services/ConfigFile.js";
export type {
	JsonSchemaExporterService,
	JsonSchemaOutput,
	SchemaEntry,
} from "./services/JsonSchemaExporter.js";
export { JsonSchemaExporter } from "./services/JsonSchemaExporter.js";
export type {
	CacheEntryMeta,
	PruneResult,
	SqliteCacheService,
} from "./services/SqliteCache.js";
export { SqliteCache } from "./services/SqliteCache.js";
export type {
	MigrationResult,
	SqliteStateService,
	StateMigration,
} from "./services/SqliteState.js";
export { SqliteState } from "./services/SqliteState.js";
export type { XdgResolverService } from "./services/XdgResolver.js";
export { XdgResolver } from "./services/XdgResolver.js";
// ── Strategies ──────────────────────────────────────────────────────────────
export type {
	ConfigSource,
	ConfigWalkStrategy,
} from "./strategies/ConfigWalkStrategy.js";
export { FirstMatch } from "./strategies/FirstMatch.js";
export { LayeredMerge } from "./strategies/LayeredMerge.js";
