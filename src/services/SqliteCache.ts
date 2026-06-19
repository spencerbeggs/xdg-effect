import type { Duration, Effect, Option, PubSub } from "effect";
import { Context } from "effect";
import type { CacheError } from "../errors/CacheError.js";
// biome-ignore lint/suspicious/noImportCycles: service class intentionally co-locates its Live layer
import { makeSqliteCacheLiveImpl } from "../layers/SqliteCacheLive.js";
// biome-ignore lint/suspicious/noImportCycles: service class intentionally co-locates its Test layer
import { SqliteCacheTestImpl } from "../layers/SqliteCacheTest.js";
// biome-ignore lint/suspicious/noImportCycles: service class intentionally co-locates its XdgLive layer
import { SqliteCacheXdgLiveImpl } from "../layers/SqliteCacheXdgLive.js";
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

/**
 * Result of a bulk cache-removal operation: how many entries were removed and
 * the keys that were removed. Returned by {@link SqliteCacheService.prune},
 * {@link SqliteCacheService.invalidateByTag}, and
 * {@link SqliteCacheService.invalidateAll}.
 *
 * @public
 */
export interface CacheRemovalResult {
	readonly count: number;
	readonly keys: ReadonlyArray<string>;
}

/**
 * Result of {@link SqliteCacheService.prune}.
 *
 * @remarks
 * Alias of {@link CacheRemovalResult}, retained for backwards compatibility.
 *
 * @public
 */
export type PruneResult = CacheRemovalResult;

export interface SqliteCacheService {
	readonly get: (key: string) => Effect.Effect<Option.Option<CacheEntry>, CacheError>;
	readonly set: (params: {
		readonly key: string;
		readonly value: Uint8Array;
		readonly contentType?: string;
		readonly tags?: ReadonlyArray<string>;
		readonly ttl?: Duration.Duration;
	}) => Effect.Effect<void, CacheError>;
	/**
	 * Remove a single entry by key.
	 *
	 * @remarks
	 * When `onRemoved` is supplied it runs inside the same transaction as the
	 * delete, before it commits, but only when an entry was actually removed —
	 * if `key` is absent the delete affects no rows and `onRemoved` is skipped.
	 * If the callback fails, the delete is rolled back and no `Invalidated`
	 * event is emitted — use this to keep the cache entry in lock-step with
	 * external side effects (e.g. deleting on-disk artifacts the entry was
	 * tracking).
	 */
	readonly invalidate: <E = never, R = never>(
		key: string,
		onRemoved?: () => Effect.Effect<void, E, R>,
	) => Effect.Effect<void, CacheError | E, R>;
	/**
	 * Remove every entry carrying `tag`.
	 *
	 * @remarks
	 * When `onRemoved` is supplied it runs inside the same transaction as the
	 * delete, before it commits, receiving the {@link CacheRemovalResult}. A
	 * failing callback rolls back the delete and suppresses the
	 * `InvalidatedByTag` event.
	 */
	readonly invalidateByTag: <E = never, R = never>(
		tag: string,
		onRemoved?: (result: CacheRemovalResult) => Effect.Effect<void, E, R>,
	) => Effect.Effect<CacheRemovalResult, CacheError | E, R>;
	/**
	 * Remove every entry in the cache.
	 *
	 * @remarks
	 * When `onRemoved` is supplied it runs inside the same transaction as the
	 * delete, before it commits, receiving the {@link CacheRemovalResult}. A
	 * failing callback rolls back the delete and suppresses the
	 * `InvalidatedAll` event.
	 */
	readonly invalidateAll: <E = never, R = never>(
		onRemoved?: (result: CacheRemovalResult) => Effect.Effect<void, E, R>,
	) => Effect.Effect<CacheRemovalResult, CacheError | E, R>;
	/**
	 * Remove all expired entries.
	 *
	 * @remarks
	 * When `onRemoved` is supplied it runs inside the same transaction as the
	 * delete, before it commits, receiving the {@link PruneResult}. A failing
	 * callback rolls back the delete and suppresses the `Pruned` event.
	 */
	readonly prune: <E = never, R = never>(
		onRemoved?: (result: PruneResult) => Effect.Effect<void, E, R>,
	) => Effect.Effect<PruneResult, CacheError | E, R>;
	readonly has: (key: string) => Effect.Effect<boolean, CacheError>;
	readonly entries: Effect.Effect<ReadonlyArray<CacheEntryMeta>, CacheError>;
	readonly events: PubSub.PubSub<CacheEvent>;
}

export class SqliteCache extends Context.Tag("xdg-effect/SqliteCache")<SqliteCache, SqliteCacheService>() {
	static Live = makeSqliteCacheLiveImpl;
	static XdgLive = SqliteCacheXdgLiveImpl;
	static Test = SqliteCacheTestImpl;
}
