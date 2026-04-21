import { mkdirSync, rmSync } from "node:fs";
import { NodeFileSystem } from "@effect/platform-node";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect, Layer, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppDirsConfig } from "../src/schemas/AppDirsConfig.js";
import { AppDirs } from "../src/services/AppDirs.js";
import type { StateMigration } from "../src/services/SqliteState.js";
import { SqliteState } from "../src/services/SqliteState.js";
import { XdgResolver } from "../src/services/XdgResolver.js";

const tmpDir = `/tmp/xdg-state-test-${Date.now()}`;
const stateDir = `${tmpDir}/state`;

const appDirsConfig = new AppDirsConfig({
	namespace: "test-app",
	fallbackDir: Option.none(),
	dirs: Option.some({
		config: Option.none(),
		data: Option.none(),
		cache: Option.none(),
		state: Option.some(stateDir),
		runtime: Option.none(),
	}),
});

const testMigrations: ReadonlyArray<StateMigration> = [
	{
		id: 1,
		name: "create-users",
		up: (sql) => sql.unsafe("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)").pipe(Effect.asVoid),
		down: (sql) => sql.unsafe("DROP TABLE users").pipe(Effect.asVoid),
	},
	{
		id: 2,
		name: "add-email",
		up: (sql) => sql.unsafe("ALTER TABLE users ADD COLUMN email TEXT").pipe(Effect.asVoid),
		down: (sql) => sql.unsafe("ALTER TABLE users DROP COLUMN email").pipe(Effect.asVoid),
	},
];

const makeLayers = (migrations: ReadonlyArray<StateMigration>) => {
	const SqliteLive = SqliteClient.layer({
		filename: `${stateDir}/state.db`,
	});
	const AppDirsLayer = Layer.provide(
		AppDirs.Live(appDirsConfig),
		Layer.mergeAll(XdgResolver.Live, NodeFileSystem.layer),
	);
	const StateLayer = SqliteState.Live({ migrations });
	return Layer.provide(StateLayer, Layer.mergeAll(AppDirsLayer, SqliteLive, NodeFileSystem.layer));
};

describe("SqliteState", () => {
	beforeEach(() => {
		mkdirSync(stateDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("runs migrations on construction", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const state = yield* SqliteState;
					return yield* state.status;
				}),
				makeLayers(testMigrations),
			),
		);
		expect(result.length).toBe(2);
		expect(result[0]?.name).toBe("create-users");
		expect(Option.isSome(result[0]?.appliedAt)).toBe(true);
		expect(result[1]?.name).toBe("add-email");
		expect(Option.isSome(result[1]?.appliedAt)).toBe(true);
	});

	it("exposes client for custom queries", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const state = yield* SqliteState;
					yield* state.client.unsafe("INSERT INTO users (name, email) VALUES ('alice', 'alice@example.com')");
					const rows = yield* state.client`SELECT * FROM users`;
					return rows;
				}),
				makeLayers(testMigrations),
			),
		);
		expect(result.length).toBe(1);
		expect((result[0] as unknown as { name: string }).name).toBe("alice");
	});

	it("supports rollback", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const state = yield* SqliteState;
					const rollbackResult = yield* state.rollback(1);
					const status = yield* state.status;
					return { rollbackResult, status };
				}),
				makeLayers(testMigrations),
			),
		);
		expect(result.rollbackResult.rolledBack.length).toBe(1);
		expect(result.rollbackResult.rolledBack[0]?.name).toBe("add-email");
		expect(Option.isSome(result.status[0]?.appliedAt)).toBe(true);
		expect(Option.isNone(result.status[1]?.appliedAt)).toBe(true);
	});
});

describe("SqliteState.Test", () => {
	it("provides in-memory state with migrations", async () => {
		const testMigration: StateMigration = {
			id: 1,
			name: "create_test_table",
			up: (sql) => sql`CREATE TABLE test_data (id INTEGER PRIMARY KEY, value TEXT)`.pipe(Effect.asVoid),
			down: (sql) => sql`DROP TABLE test_data`.pipe(Effect.asVoid),
		};

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const state = yield* SqliteState;
					return yield* state.status;
				}),
				SqliteState.Test({ migrations: [testMigration] }),
			),
		);
		expect(result.length).toBe(1);
		expect(result[0]?.name).toBe("create_test_table");
		expect(Option.isSome(result[0]?.appliedAt ?? Option.none())).toBe(true);
	});
});
