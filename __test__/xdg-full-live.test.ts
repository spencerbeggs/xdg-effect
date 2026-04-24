import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { ConfigFile, ExplicitPath, FirstMatch, TomlCodec } from "config-file-effect";
import { ConfigProvider, Effect, Option, Schema } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StateMigration } from "../src/index.js";
import { AppDirs, AppDirsConfig, SqliteCache, SqliteState, XdgFullLive, XdgResolver } from "../src/index.js";

const TestSchema = Schema.Struct({ name: Schema.String });
type TestConfig = typeof TestSchema.Type;
const TestTag = ConfigFile.Tag<TestConfig>("test/FullLiveConfig");

const tmpDir = `/tmp/xdg-full-test-${Date.now()}`;

const migrations: ReadonlyArray<StateMigration> = [
	{
		id: 1,
		name: "create-test",
		up: (client) => client.unsafe("CREATE TABLE test_full (id INTEGER PRIMARY KEY, val TEXT)").pipe(Effect.asVoid),
		down: (client) => client.unsafe("DROP TABLE IF EXISTS test_full").pipe(Effect.asVoid),
	},
];

describe("XdgFullLive", () => {
	beforeEach(() => {
		mkdirSync(tmpDir, { recursive: true });
		writeFileSync(join(tmpDir, "config.toml"), 'name = "full-test"\n');
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("provides all 5 services", async () => {
		const provider = ConfigProvider.fromMap(new Map([["HOME", tmpDir]]));

		const layer = XdgFullLive({
			app: new AppDirsConfig({ namespace: "full-test" }),
			config: {
				tag: TestTag,
				schema: TestSchema,
				codec: TomlCodec,
				strategy: FirstMatch,
				resolvers: [ExplicitPath(join(tmpDir, "config.toml"))],
			},
			migrations,
		});

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const resolver = yield* XdgResolver;
				const appDirs = yield* AppDirs;
				const configFile = yield* TestTag;
				yield* SqliteCache;
				yield* SqliteState;

				const home = yield* resolver.home;
				const configDir = yield* appDirs.config;
				const config = yield* configFile.load;

				return { home, configDir, configName: config.name };
			}).pipe(
				Effect.withConfigProvider(provider),
				Effect.provide(layer),
				Effect.provide(SqliteClient.layer({ filename: ":memory:" })),
				Effect.provide(NodeFileSystem.layer),
			),
		);

		expect(typeof result.home).toBe("string");
		expect(typeof result.configDir).toBe("string");
		expect(result.configName).toBe("full-test");
	});

	it("cache and state operations work end-to-end", async () => {
		const provider = ConfigProvider.fromMap(new Map([["HOME", tmpDir]]));

		const layer = XdgFullLive({
			app: new AppDirsConfig({ namespace: "full-test" }),
			config: {
				tag: TestTag,
				schema: TestSchema,
				codec: TomlCodec,
				strategy: FirstMatch,
				resolvers: [ExplicitPath(join(tmpDir, "config.toml"))],
			},
			migrations,
		});

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const cache = yield* SqliteCache;
				const state = yield* SqliteState;

				// Cache: set and get
				yield* cache.set({ key: "test", value: new TextEncoder().encode("hello") });
				const entry = yield* cache.get("test");

				// State: verify migration ran (auto-applied on construction)
				const status = yield* state.status;

				// State: use the migrated table
				yield* state.client.unsafe("INSERT INTO test_full (val) VALUES ('world')");
				const rows = yield* state.client`SELECT val FROM test_full`;

				return {
					cacheHit: Option.isSome(entry),
					migrationsApplied: status.length,
					stateRows: rows.length,
				};
			}).pipe(
				Effect.withConfigProvider(provider),
				Effect.provide(layer),
				Effect.provide(SqliteClient.layer({ filename: ":memory:" })),
				Effect.provide(NodeFileSystem.layer),
			),
		);

		expect(result.cacheHit).toBe(true);
		expect(result.migrationsApplied).toBe(1);
		expect(result.stateRows).toBe(1);
	});
});
