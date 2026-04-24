import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect, Layer } from "effect";
import { AppDirs } from "../services/AppDirs.js";
import type { SqliteCache } from "../services/SqliteCache.js";
// biome-ignore lint/suspicious/noImportCycles: XdgLive layer intentionally co-locates with its Live layer in the same cycle
import { makeSqliteCacheLiveImpl } from "./SqliteCacheLive.js";

export const SqliteCacheXdgLiveImpl = (options?: {
	readonly filename?: string;
}): Layer.Layer<SqliteCache, never, AppDirs> =>
	Layer.unwrapEffect(
		Effect.gen(function* () {
			const appDirs = yield* AppDirs;
			const cacheDir = yield* appDirs.ensureCache;
			const dbPath = `${cacheDir}/${options?.filename ?? "cache.db"}`;
			return makeSqliteCacheLiveImpl().pipe(Layer.provide(SqliteClient.layer({ filename: dbPath }).pipe(Layer.orDie)));
		}).pipe(Effect.orDie),
	);
