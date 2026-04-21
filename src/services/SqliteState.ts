import type { SqlClient } from "@effect/sql";
import type { Effect } from "effect";
import { Context } from "effect";
import type { StateError } from "../errors/StateError.js";
// biome-ignore lint/suspicious/noImportCycles: service class intentionally co-locates its Live layer
import { makeSqliteStateLiveImpl } from "../layers/SqliteStateLive.js";
// biome-ignore lint/suspicious/noImportCycles: service class intentionally co-locates its Test layer
import { SqliteStateTestImpl } from "../layers/SqliteStateTest.js";
import type { MigrationStatus } from "../schemas/MigrationStatus.js";

export interface StateMigration {
	readonly id: number;
	readonly name: string;
	readonly up: (client: SqlClient.SqlClient) => Effect.Effect<void, unknown>;
	readonly down?: (client: SqlClient.SqlClient) => Effect.Effect<void, unknown>;
}

export interface MigrationResult {
	readonly applied: ReadonlyArray<{
		readonly id: number;
		readonly name: string;
	}>;
	readonly rolledBack: ReadonlyArray<{
		readonly id: number;
		readonly name: string;
	}>;
}

export interface SqliteStateService {
	readonly client: SqlClient.SqlClient;
	readonly migrate: Effect.Effect<MigrationResult, StateError>;
	readonly rollback: (toId: number) => Effect.Effect<MigrationResult, StateError>;
	readonly status: Effect.Effect<ReadonlyArray<MigrationStatus>, StateError>;
}

export class SqliteState extends Context.Tag("xdg-effect/SqliteState")<SqliteState, SqliteStateService>() {
	static Live = makeSqliteStateLiveImpl;
	static Test = SqliteStateTestImpl;
}
