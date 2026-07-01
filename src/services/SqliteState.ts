import type { SqlClient } from "@effect/sql";
import type { Effect } from "effect";
import { Context } from "effect";
import type { StateError } from "../errors/StateError.js";
// biome-ignore lint/suspicious/noImportCycles: service class intentionally co-locates its Live layer
import { makeSqliteStateLiveImpl } from "../layers/SqliteStateLive.js";
// biome-ignore lint/suspicious/noImportCycles: service class intentionally co-locates its Test layer
import { SqliteStateTestImpl } from "../layers/SqliteStateTest.js";
// biome-ignore lint/suspicious/noImportCycles: service class intentionally co-locates its XdgLive layer
import { SqliteStateXdgLiveImpl } from "../layers/SqliteStateXdgLive.js";
import type { MigrationStatus } from "../schemas/MigrationStatus.js";

/**
 * A single user-defined migration, applied in ascending `id` order.
 *
 * @public
 */
export interface StateMigration {
	readonly id: number;
	readonly name: string;
	readonly up: (client: SqlClient.SqlClient) => Effect.Effect<void, unknown>;
	readonly down?: (client: SqlClient.SqlClient) => Effect.Effect<void, unknown>;
}

/**
 * The migrations applied and rolled back by a {@link SqliteStateService.migrate}
 * or {@link SqliteStateService.rollback} call.
 *
 * @public
 */
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

/**
 * Managed SQLite connection with a user-defined migration ledger.
 *
 * @public
 */
export interface SqliteStateService {
	readonly client: SqlClient.SqlClient;
	readonly migrate: Effect.Effect<MigrationResult, StateError>;
	readonly rollback: (toId: number) => Effect.Effect<MigrationResult, StateError>;
	readonly status: Effect.Effect<ReadonlyArray<MigrationStatus>, StateError>;
}

/**
 * Service tag for {@link SqliteStateService}, a managed SQLite connection
 * with user-defined migrations.
 *
 * @public
 */
export class SqliteState extends Context.Tag("xdg-effect/SqliteState")<SqliteState, SqliteStateService>() {
	static Live = makeSqliteStateLiveImpl;
	static XdgLive = SqliteStateXdgLiveImpl;
	static Test = SqliteStateTestImpl;
}
