import type { Duration, Effect, Option, PubSub } from "effect";
import { Context } from "effect";
import type { CacheError } from "../errors/CacheError.js";
// biome-ignore lint/suspicious/noImportCycles: service class intentionally co-locates its Live layer
import { makeSqliteCacheLiveImpl } from "../layers/SqliteCacheLive.js";
// biome-ignore lint/suspicious/noImportCycles: service class intentionally co-locates its Test layer
import { SqliteCacheTestImpl } from "../layers/SqliteCacheTest.js";
import type { CacheEntry } from "../schemas/CacheEntry.js";
import type { CacheEvent } from "../schemas/CacheEvent.js";

export interface CacheEntryMeta {
	readonly key: string;
	readonly contentType: string;
	readonly tags: ReadonlyArray<string>;
	readonly created: string;
	readonly expiresAt: string | undefined;
	readonly sizeBytes: number;
}

export interface PruneResult {
	readonly count: number;
}

export interface SqliteCacheService {
	readonly get: (key: string) => Effect.Effect<Option.Option<CacheEntry>, CacheError>;
	readonly set: (params: {
		readonly key: string;
		readonly value: Uint8Array;
		readonly contentType?: string;
		readonly tags?: ReadonlyArray<string>;
		readonly ttl?: Duration.Duration;
	}) => Effect.Effect<void, CacheError>;
	readonly invalidate: (key: string) => Effect.Effect<void, CacheError>;
	readonly invalidateByTag: (tag: string) => Effect.Effect<void, CacheError>;
	readonly invalidateAll: Effect.Effect<void, CacheError>;
	readonly prune: Effect.Effect<PruneResult, CacheError>;
	readonly has: (key: string) => Effect.Effect<boolean, CacheError>;
	readonly entries: Effect.Effect<ReadonlyArray<CacheEntryMeta>, CacheError>;
	readonly events: PubSub.PubSub<CacheEvent>;
}

export class SqliteCache extends Context.Tag("xdg-effect/SqliteCache")<SqliteCache, SqliteCacheService>() {
	static Live = makeSqliteCacheLiveImpl;
	static Test = SqliteCacheTestImpl;
}
