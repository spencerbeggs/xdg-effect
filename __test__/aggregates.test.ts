import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Layer, Option, Schema } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonCodec } from "../src/codecs/JsonCodec.js";
import { XdgConfigLive } from "../src/layers/XdgConfigLive.js";
import { XdgLive } from "../src/layers/XdgLive.js";
import { StaticDir } from "../src/resolvers/StaticDir.js";
import { AppDirs } from "../src/services/AppDirs.js";
import { makeConfigFileTag } from "../src/services/ConfigFile.js";
import { XdgResolver } from "../src/services/XdgResolver.js";
import { FirstMatch } from "../src/strategies/FirstMatch.js";

const TestConfigSchema = Schema.Struct({ name: Schema.String });
type TestConfig = typeof TestConfigSchema.Type;
const TestConfig = makeConfigFileTag<TestConfig>("test/AggConfig");

const tmpDir = `/tmp/xdg-aggregate-test-${Date.now()}`;

describe("XdgLive", () => {
	it("provides XdgResolver and AppDirs", async () => {
		const layer = Layer.provide(
			XdgLive({
				namespace: "agg-test",
				fallbackDir: Option.some(".agg-test"),
				dirs: Option.none(),
			}),
			NodeFileSystem.layer,
		);
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const resolver = yield* XdgResolver;
					const appDirs = yield* AppDirs;
					const home = yield* resolver.home;
					const config = yield* appDirs.config;
					return { home, config };
				}),
				layer,
			),
		);
		expect(typeof result.home).toBe("string");
		expect(typeof result.config).toBe("string");
	});
});

describe("XdgConfigLive", () => {
	beforeEach(() => {
		mkdirSync(join(tmpDir, "config"), { recursive: true });
		writeFileSync(join(tmpDir, "config", "app.json"), JSON.stringify({ name: "test" }));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("provides XdgResolver, AppDirs, and ConfigFile", async () => {
		const layer = Layer.provide(
			XdgConfigLive({
				app: {
					namespace: "agg-test",
					fallbackDir: Option.none(),
					dirs: Option.some({
						config: Option.some(join(tmpDir, "config")),
						data: Option.none(),
						cache: Option.none(),
						state: Option.none(),
						runtime: Option.none(),
					}),
				},
				config: {
					tag: TestConfig,
					schema: TestConfigSchema,
					codec: JsonCodec,
					strategy: FirstMatch,
					resolvers: [StaticDir({ dir: join(tmpDir, "config"), filename: "app.json" })],
				},
			}),
			NodeFileSystem.layer,
		);

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const config = yield* TestConfig;
					return yield* config.load;
				}),
				layer,
			),
		);
		expect(result.name).toBe("test");
	});
});
