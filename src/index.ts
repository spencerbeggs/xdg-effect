/**
 * xdg-effect
 *
 * Opinionated Effect library for XDG Base Directory support with progressive
 * layers from path resolution through config management to SQLite-backed
 * caching and state.
 *
 * @packageDocumentation
 */

// ── Re-exports from config-file-effect ─────────────────────────────────────
export type {
	ConfigCodec,
	ConfigEventsService,
	ConfigFileChange,
	ConfigFileMigration,
	ConfigFileOptions,
	ConfigFileService,
	ConfigFileTestOptions,
	ConfigMigrationOptions,
	ConfigResolver,
	ConfigSource,
	ConfigWalkStrategy,
	ConfigWatcherOptions,
	ConfigWatcherService,
	WatchOptions,
} from "config-file-effect";
export {
	CodecError,
	CodecErrorBase,
	ConfigError,
	ConfigErrorBase,
	ConfigEvent,
	ConfigEventPayload,
	ConfigEvents,
	ConfigFile,
	ConfigMigration,
	ConfigWatcher,
	EncryptedCodec,
	EncryptedCodecKey,
	ExplicitPath,
	FirstMatch,
	GitRoot,
	JsonCodec,
	LayeredMerge,
	StaticDir,
	TomlCodec,
	UpwardWalk,
	VersionAccess,
	WorkspaceRoot,
} from "config-file-effect";
// ── Re-exports from json-schema-effect ─────────────────────────────────────
export type {
	JsonSchemaClassStatics,
	JsonSchemaExporterService,
	JsonSchemaOutput,
	JsonSchemaScaffolderService,
	JsonSchemaValidatorService,
	ScaffoldHelperOptions,
	ScaffoldOptions,
	SchemaEntry,
	TaploOptions,
	TombiOptions,
	ValidatorOptions,
	WriteResult,
} from "json-schema-effect";
export {
	JsonSchemaClass,
	JsonSchemaError,
	JsonSchemaErrorBase,
	JsonSchemaExporter,
	JsonSchemaScaffolder,
	JsonSchemaValidationError,
	JsonSchemaValidationErrorBase,
	JsonSchemaValidator,
	Jsonifiable,
	ScaffoldError,
	ScaffoldErrorBase,
	Unchanged,
	Written,
	scaffoldJson,
	scaffoldToml,
	taplo,
	tombi,
} from "json-schema-effect";
// ── Errors ──────────────────────────────────────────────────────────────────
export { AppDirsError, AppDirsErrorBase } from "./errors/AppDirsError.js";
export { CacheError, CacheErrorBase } from "./errors/CacheError.js";
export { StateError, StateErrorBase } from "./errors/StateError.js";
export type { XdgEffectError } from "./errors/types.js";
export { XdgError, XdgErrorBase } from "./errors/XdgError.js";
// ── Layers (composites) ────────────────────────────────────────────────────
export type { XdgConfigLiveOptions, XdgConfigMultiOptions, XdgConfigPresetOptions } from "./layers/XdgConfigLive.js";
export { XdgConfigLive } from "./layers/XdgConfigLive.js";
export type { XdgFullLiveOptions, XdgFullPresetOptions } from "./layers/XdgFullLive.js";
export { XdgFullLive } from "./layers/XdgFullLive.js";
export { XdgLive } from "./layers/XdgLive.js";
export type { XdgResolverTestOptions } from "./layers/XdgResolverTest.js";
// ── Resolvers ───────────────────────────────────────────────────────────────
/** @deprecated Use XdgConfigResolver instead */
export { XdgConfigResolver, XdgConfigResolver as XdgConfig } from "./resolvers/XdgConfigResolver.js";
export { XdgSavePath } from "./resolvers/XdgSavePath.js";
// ── Schemas ─────────────────────────────────────────────────────────────────
export { AppDirsConfig } from "./schemas/AppDirsConfig.js";
export { CacheEntry } from "./schemas/CacheEntry.js";
export { CacheEvent, CacheEventPayload } from "./schemas/CacheEvent.js";
export { MigrationStatus } from "./schemas/MigrationStatus.js";
export { ResolvedAppDirs } from "./schemas/ResolvedAppDirs.js";
export { XdgPaths } from "./schemas/XdgPaths.js";
// ── Services ────────────────────────────────────────────────────────────────
export type { AppDirsService } from "./services/AppDirs.js";
export { AppDirs } from "./services/AppDirs.js";
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
