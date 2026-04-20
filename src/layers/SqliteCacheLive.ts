import { SqlClient } from "@effect/sql";
import type { Duration } from "effect";
import { DateTime, Effect, Layer, Option, PubSub } from "effect";
import { CacheError } from "../errors/CacheError.js";
import { CacheEntry } from "../schemas/CacheEntry.js";
import { CacheEvent } from "../schemas/CacheEvent.js";
import type { PruneResult } from "../services/SqliteCache.js";
import { SqliteCache } from "../services/SqliteCache.js";

const emit = (pubsub: PubSub.PubSub<CacheEvent>, event: typeof CacheEvent.Type.event) =>
	Effect.gen(function* () {
		const now = yield* DateTime.now;
		yield* PubSub.publish(pubsub, new CacheEvent({ timestamp: now, event }));
	}).pipe(Effect.catchAll(() => Effect.void));

const wrapCacheError =
	(operation: string, key?: string) =>
	<A>(effect: Effect.Effect<A, unknown>): Effect.Effect<A, CacheError> => {
		const errorProps = key !== undefined ? { operation, key, reason: "" } : { operation, reason: "" };
		return effect.pipe(
			Effect.catchAllDefect((defect) => Effect.fail(new CacheError({ ...errorProps, reason: String(defect) }))),
			Effect.catchIf(
				(e): e is Exclude<typeof e, CacheError> => !(e instanceof CacheError),
				(e) => Effect.fail(new CacheError({ ...errorProps, reason: String(e) })),
			),
		);
	};

export const makeSqliteCacheLive = (): Layer.Layer<SqliteCache, never, SqlClient.SqlClient> =>
	Layer.effect(
		SqliteCache,
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			const pubsub = yield* PubSub.unbounded<CacheEvent>();

			// Create table and index
			yield* sql`
				CREATE TABLE IF NOT EXISTS cache_entries (
					key TEXT PRIMARY KEY,
					value BLOB NOT NULL,
					content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
					tags TEXT NOT NULL DEFAULT '[]',
					created TEXT NOT NULL,
					expires_at TEXT,
					size_bytes INTEGER NOT NULL
				)
			`.pipe(Effect.orDie);
			yield* sql`
				CREATE INDEX IF NOT EXISTS idx_cache_expires
				ON cache_entries (expires_at)
				WHERE expires_at IS NOT NULL
			`.pipe(Effect.orDie);

			const get = (key: string) =>
				Effect.gen(function* () {
					const rows = yield* sql`
						SELECT key, value, content_type, tags, created, expires_at, size_bytes
						FROM cache_entries
						WHERE key = ${key}
					`;
					if (rows.length === 0) {
						yield* emit(pubsub, { _tag: "Miss", key });
						return Option.none<CacheEntry>();
					}
					const row = rows[0] as {
						key: string;
						value: Uint8Array;
						content_type: string;
						tags: string;
						created: string;
						expires_at: string | null;
						size_bytes: number;
					};
					// Check if expired
					if (row.expires_at !== null) {
						const expiresAt = DateTime.unsafeMake(new Date(row.expires_at));
						const now = yield* DateTime.now;
						if (DateTime.lessThan(expiresAt, now)) {
							// Entry is expired — delete it and emit
							yield* sql`DELETE FROM cache_entries WHERE key = ${key}`;
							yield* emit(pubsub, { _tag: "Expired", key });
							yield* emit(pubsub, { _tag: "Miss", key });
							return Option.none<CacheEntry>();
						}
					}
					const entry = new CacheEntry({
						key: row.key,
						value: row.value instanceof Uint8Array ? row.value : new Uint8Array(row.value as ArrayBuffer),
						contentType: row.content_type,
						tags: JSON.parse(row.tags) as Array<string>,
						created: DateTime.unsafeMake(new Date(row.created)),
						expiresAt:
							row.expires_at !== null ? Option.some(DateTime.unsafeMake(new Date(row.expires_at))) : Option.none(),
						sizeBytes: row.size_bytes,
					});
					yield* emit(pubsub, { _tag: "Hit", key });
					return Option.some(entry);
				}).pipe(wrapCacheError("get", key));

			const set = (params: {
				readonly key: string;
				readonly value: Uint8Array;
				readonly contentType?: string;
				readonly tags?: ReadonlyArray<string>;
				readonly ttl?: Duration.Duration;
			}) =>
				Effect.gen(function* () {
					const now = yield* DateTime.now;
					const created = DateTime.formatIso(now);
					const contentType = params.contentType ?? "application/octet-stream";
					const tags = JSON.stringify(params.tags ?? []);
					const sizeBytes = params.value.length;
					const expiresAt = params.ttl ? DateTime.formatIso(DateTime.addDuration(now, params.ttl)) : null;

					yield* sql`
						INSERT OR REPLACE INTO cache_entries
							(key, value, content_type, tags, created, expires_at, size_bytes)
						VALUES
							(${params.key}, ${params.value}, ${contentType}, ${tags}, ${created}, ${expiresAt}, ${sizeBytes})
					`;
					yield* emit(pubsub, {
						_tag: "Set",
						key: params.key,
						sizeBytes,
						tags: (params.tags ?? []) as Array<string>,
					});
				}).pipe(wrapCacheError("set", params.key));

			const invalidate = (key: string) =>
				Effect.gen(function* () {
					yield* sql`DELETE FROM cache_entries WHERE key = ${key}`;
					yield* emit(pubsub, { _tag: "Invalidated", key });
				}).pipe(wrapCacheError("invalidate", key));

			const invalidateByTag = (tag: string) =>
				Effect.gen(function* () {
					const escaped = tag.replace(/[%_\\]/g, "\\$&");
					const pattern = `%"${escaped}"%`;
					const before = yield* sql`SELECT COUNT(*) as count FROM cache_entries WHERE tags LIKE ${pattern} ESCAPE '\\'`;
					const count = (before[0] as { count: number }).count;
					yield* sql`DELETE FROM cache_entries WHERE tags LIKE ${pattern} ESCAPE '\\'`;
					yield* emit(pubsub, {
						_tag: "InvalidatedByTag",
						tag,
						count,
					});
				}).pipe(wrapCacheError("invalidateByTag"));

			const invalidateAll = Effect.gen(function* () {
				const before = yield* sql`SELECT COUNT(*) as count FROM cache_entries`;
				const count = (before[0] as { count: number }).count;
				yield* sql`DELETE FROM cache_entries`;
				yield* emit(pubsub, { _tag: "InvalidatedAll", count });
			}).pipe(wrapCacheError("invalidateAll"));

			const prune: Effect.Effect<PruneResult, CacheError> = Effect.gen(function* () {
				const now = yield* DateTime.now;
				const nowIso = DateTime.formatIso(now);
				const before =
					yield* sql`SELECT COUNT(*) as count FROM cache_entries WHERE expires_at IS NOT NULL AND expires_at <= ${nowIso}`;
				const count = (before[0] as { count: number }).count;
				yield* sql`DELETE FROM cache_entries WHERE expires_at IS NOT NULL AND expires_at <= ${nowIso}`;
				yield* emit(pubsub, { _tag: "Pruned", count });
				return { count } satisfies PruneResult;
			}).pipe(wrapCacheError("prune"));

			const has = (key: string) =>
				Effect.gen(function* () {
					const rows = yield* sql`SELECT key, expires_at FROM cache_entries WHERE key = ${key}`;
					if (rows.length === 0) {
						return false;
					}
					const row = rows[0] as {
						key: string;
						expires_at: string | null;
					};
					if (row.expires_at !== null) {
						const expiresAt = DateTime.unsafeMake(new Date(row.expires_at));
						const now = yield* DateTime.now;
						if (DateTime.lessThan(expiresAt, now)) {
							yield* sql`DELETE FROM cache_entries WHERE key = ${key}`;
							return false;
						}
					}
					return true;
				}).pipe(wrapCacheError("has", key));

			const entries = Effect.gen(function* () {
				const rows = yield* sql`
					SELECT key, content_type, tags, created, expires_at, size_bytes
					FROM cache_entries
				`;
				return rows.map((row) => {
					const r = row as {
						key: string;
						content_type: string;
						tags: string;
						created: string;
						expires_at: string | null;
						size_bytes: number;
					};
					return {
						key: r.key,
						contentType: r.content_type,
						tags: JSON.parse(r.tags) as Array<string>,
						created: r.created,
						expiresAt: r.expires_at ?? undefined,
						sizeBytes: r.size_bytes,
					};
				});
			}).pipe(wrapCacheError("entries"));

			return SqliteCache.of({
				get,
				set,
				invalidate,
				invalidateByTag,
				invalidateAll,
				prune,
				has,
				entries,
				events: pubsub,
			});
		}),
	);
