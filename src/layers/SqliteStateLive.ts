import { SqlClient } from "@effect/sql";
import { DateTime, Effect, Layer, Option } from "effect";
import { StateError } from "../errors/StateError.js";
import { MigrationStatus } from "../schemas/MigrationStatus.js";
import type { MigrationResult, StateMigration } from "../services/SqliteState.js";
import { SqliteState } from "../services/SqliteState.js";

export const makeSqliteStateLive = (options: {
	readonly migrations: ReadonlyArray<StateMigration>;
}): Layer.Layer<SqliteState, never, SqlClient.SqlClient> =>
	Layer.effect(
		SqliteState,
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			const { migrations } = options;

			// Create the internal migrations tracking table
			yield* sql`
				CREATE TABLE IF NOT EXISTS _xdg_migrations (
					id INTEGER PRIMARY KEY,
					name TEXT NOT NULL,
					applied_at TEXT NOT NULL
				)
			`.pipe(Effect.orDie);

			// Run all pending migrations forward on construction
			yield* runPendingMigrations(sql, migrations).pipe(Effect.orDie);

			const migrate: Effect.Effect<MigrationResult, StateError> = runPendingMigrations(sql, migrations);

			const rollback = (toId: number): Effect.Effect<MigrationResult, StateError> =>
				Effect.gen(function* () {
					// Find all applied migrations with id > toId, in reverse order
					const appliedRows = yield* sql`
						SELECT id, name FROM _xdg_migrations
						WHERE id > ${toId}
						ORDER BY id DESC
					`;

					const rolledBack: Array<{
						readonly id: number;
						readonly name: string;
					}> = [];

					for (const row of appliedRows) {
						const r = row as { id: number; name: string };
						const migration = migrations.find((m) => m.id === r.id);
						if (migration?.down) {
							yield* migration.down(sql).pipe(Effect.orDie);
						}
						yield* sql`DELETE FROM _xdg_migrations WHERE id = ${r.id}`;
						rolledBack.push({
							id: r.id,
							name: r.name,
						});
					}

					return {
						applied: [],
						rolledBack,
					} satisfies MigrationResult;
				}).pipe(
					Effect.catchAllDefect((defect) =>
						Effect.fail(
							new StateError({
								operation: "rollback",
								reason: String(defect),
							}),
						),
					),
					Effect.catchIf(
						(e): e is Exclude<typeof e, StateError> => !(e instanceof StateError),
						(e) =>
							Effect.fail(
								new StateError({
									operation: "rollback",
									reason: String(e),
								}),
							),
					),
				);

			const status: Effect.Effect<ReadonlyArray<MigrationStatus>, StateError> = Effect.gen(function* () {
				const appliedRows = yield* sql`
					SELECT id, name, applied_at FROM _xdg_migrations
					ORDER BY id ASC
				`;
				const appliedMap = new Map<number, { name: string; appliedAt: string }>();
				for (const row of appliedRows) {
					const r = row as {
						id: number;
						name: string;
						applied_at: string;
					};
					appliedMap.set(r.id, {
						name: r.name,
						appliedAt: r.applied_at,
					});
				}

				return migrations.map((m) => {
					const applied = appliedMap.get(m.id);
					return new MigrationStatus({
						id: m.id,
						name: m.name,
						appliedAt: applied ? Option.some(DateTime.unsafeMake(new Date(applied.appliedAt))) : Option.none(),
					});
				});
			}).pipe(
				Effect.catchAllDefect((defect) =>
					Effect.fail(
						new StateError({
							operation: "status",
							reason: String(defect),
						}),
					),
				),
				Effect.catchIf(
					(e): e is Exclude<typeof e, StateError> => !(e instanceof StateError),
					(e) =>
						Effect.fail(
							new StateError({
								operation: "status",
								reason: String(e),
							}),
						),
				),
			);

			return SqliteState.of({
				client: sql,
				migrate,
				rollback,
				status,
			});
		}),
	);

const runPendingMigrations = (
	sql: SqlClient.SqlClient,
	migrations: ReadonlyArray<StateMigration>,
): Effect.Effect<MigrationResult, StateError> =>
	Effect.gen(function* () {
		const appliedRows = yield* sql`
			SELECT id FROM _xdg_migrations ORDER BY id ASC
		`;
		const appliedIds = new Set(appliedRows.map((r) => (r as { id: number }).id));

		const pending = migrations.filter((m) => !appliedIds.has(m.id));
		// Sort by id ascending to apply in order
		const sorted = [...pending].sort((a, b) => a.id - b.id);

		const applied: Array<{
			readonly id: number;
			readonly name: string;
		}> = [];

		for (const migration of sorted) {
			yield* migration.up(sql).pipe(Effect.orDie);
			const now = yield* DateTime.now;
			const nowIso = DateTime.formatIso(now);
			yield* sql`
				INSERT INTO _xdg_migrations (id, name, applied_at)
				VALUES (${migration.id}, ${migration.name}, ${nowIso})
			`;
			applied.push({ id: migration.id, name: migration.name });
		}

		return {
			applied,
			rolledBack: [],
		} satisfies MigrationResult;
	}).pipe(
		Effect.catchAllDefect((defect) =>
			Effect.fail(
				new StateError({
					operation: "migrate",
					reason: String(defect),
				}),
			),
		),
		Effect.catchIf(
			(e): e is Exclude<typeof e, StateError> => !(e instanceof StateError),
			(e) =>
				Effect.fail(
					new StateError({
						operation: "migrate",
						reason: String(e),
					}),
				),
		),
	);
