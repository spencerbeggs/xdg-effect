import { SqliteClient } from "@effect/sql-sqlite-node";
import { Layer } from "effect";
import type { SqliteCache } from "../services/SqliteCache.js";
// biome-ignore lint/suspicious/noImportCycles: Test layer intentionally co-locates with Live layer in the same cycle
import { makeSqliteCacheLiveImpl } from "./SqliteCacheLive.js";

export const SqliteCacheTestImpl = (): Layer.Layer<SqliteCache> =>
	makeSqliteCacheLiveImpl().pipe(Layer.provide(SqliteClient.layer({ filename: ":memory:" })), Layer.orDie);
