import { SqliteClient } from "@effect/sql-sqlite-node";
import { Layer } from "effect";
import type { SqliteState, StateMigration } from "../services/SqliteState.js";
// biome-ignore lint/suspicious/noImportCycles: Test layer intentionally co-locates with Live layer in the same cycle
import { makeSqliteStateLiveImpl } from "./SqliteStateLive.js";

export const SqliteStateTestImpl = (options: {
	readonly migrations: ReadonlyArray<StateMigration>;
}): Layer.Layer<SqliteState> =>
	makeSqliteStateLiveImpl(options).pipe(Layer.provide(SqliteClient.layer({ filename: ":memory:" }).pipe(Layer.orDie)));
