import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import { AppDirs } from "../src/services/AppDirs.js";
import { SqliteCache } from "../src/services/SqliteCache.js";
import type { StateMigration } from "../src/services/SqliteState.js";
import { SqliteState } from "../src/services/SqliteState.js";

describe("SqliteCache.XdgLive", () => {
	it("creates cache database in XDG cache directory", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const cache = yield* SqliteCache;
				const encoder = new TextEncoder();
				yield* cache.set({ key: "test", value: encoder.encode("hello") });
				const entry = yield* cache.get("test");
				return Option.isSome(entry);
			}).pipe(
				Effect.provide(SqliteCache.XdgLive()),
				Effect.provide(AppDirs.Test({ namespace: "sqlite-xdg-cache-test" })),
				Effect.provide(NodeFileSystem.layer),
				Effect.scoped,
			),
		);
		expect(result).toBe(true);
	});

	it("accepts custom filename", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const cache = yield* SqliteCache;
				yield* cache.set({ key: "x", value: new Uint8Array([1]) });
				return yield* cache.has("x");
			}).pipe(
				Effect.provide(SqliteCache.XdgLive({ filename: "custom-cache.db" })),
				Effect.provide(AppDirs.Test({ namespace: "sqlite-xdg-cache-custom-test" })),
				Effect.provide(NodeFileSystem.layer),
				Effect.scoped,
			),
		);
		expect(result).toBe(true);
	});
});

const testMigrations: ReadonlyArray<StateMigration> = [
	{
		id: 1,
		name: "create-test-table",
		up: (client) => client`CREATE TABLE test_data (id INTEGER PRIMARY KEY, value TEXT)`.pipe(Effect.asVoid),
		down: (client) => client`DROP TABLE IF EXISTS test_data`.pipe(Effect.asVoid),
	},
];

describe("SqliteState.XdgLive", () => {
	it("creates state database in XDG data directory", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const state = yield* SqliteState;
				const status = yield* state.status;
				return status.length;
			}).pipe(
				Effect.provide(SqliteState.XdgLive({ migrations: testMigrations })),
				Effect.provide(AppDirs.Test({ namespace: "sqlite-xdg-state-test" })),
				Effect.provide(NodeFileSystem.layer),
				Effect.scoped,
			),
		);
		expect(result).toBe(1);
	});
});
