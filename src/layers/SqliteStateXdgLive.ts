import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect, Layer } from "effect";
import { AppDirs } from "../services/AppDirs.js";
import type { SqliteState, StateMigration } from "../services/SqliteState.js";
// biome-ignore lint/suspicious/noImportCycles: XdgLive layer intentionally co-locates with its Live layer in the same cycle
import { makeSqliteStateLiveImpl } from "./SqliteStateLive.js";

export const SqliteStateXdgLiveImpl = (options: {
	readonly migrations: ReadonlyArray<StateMigration>;
	readonly filename?: string;
}): Layer.Layer<SqliteState, never, AppDirs> =>
	Layer.unwrapEffect(
		Effect.gen(function* () {
			const appDirs = yield* AppDirs;
			const dataDir = yield* appDirs.ensureData;
			const dbPath = `${dataDir}/${options.filename ?? "state.db"}`;
			return makeSqliteStateLiveImpl({ migrations: options.migrations }).pipe(
				Layer.provide(SqliteClient.layer({ filename: dbPath }).pipe(Layer.orDie)),
			);
		}).pipe(Effect.orDie),
	);
