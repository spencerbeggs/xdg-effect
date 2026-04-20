import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Layer, Schema } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonCodec } from "../src/codecs/JsonCodec.js";
import { makeConfigFileLive } from "../src/layers/ConfigFileLive.js";
import { ExplicitPath } from "../src/resolvers/ExplicitPath.js";
import { StaticDir } from "../src/resolvers/StaticDir.js";
import { makeConfigFileTag } from "../src/services/ConfigFile.js";
import { FirstMatch } from "../src/strategies/FirstMatch.js";
import { LayeredMerge } from "../src/strategies/LayeredMerge.js";

const TestConfigSchema = Schema.Struct({
	name: Schema.String,
	port: Schema.optional(Schema.Number),
});
type TestConfig = typeof TestConfigSchema.Type;

const TestConfig = makeConfigFileTag<TestConfig>("test/Config");

const tmpBase = `/tmp/xdg-config-test-${Date.now()}`;

describe("ConfigFile", () => {
	beforeEach(() => {
		mkdirSync(`${tmpBase}/project`, { recursive: true });
		mkdirSync(`${tmpBase}/xdg-config`, { recursive: true });
	});

	afterEach(() => {
		rmSync(tmpBase, { recursive: true, force: true });
	});

	it("loads config from explicit path with FirstMatch", async () => {
		const configPath = join(tmpBase, "project", "app.config.json");
		writeFileSync(configPath, JSON.stringify({ name: "explicit", port: 3000 }));

		const ConfigLayer = makeConfigFileLive({
			tag: TestConfig,
			schema: TestConfigSchema,
			codec: JsonCodec,
			strategy: FirstMatch,
			resolvers: [ExplicitPath(configPath)],
		});

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const config = yield* TestConfig;
					return yield* config.load;
				}),
				Layer.provide(ConfigLayer, NodeFileSystem.layer),
			),
		);
		expect(result.name).toBe("explicit");
		expect(result.port).toBe(3000);
	});

	it("discovers multiple sources", async () => {
		const projectConfig = join(tmpBase, "project", "app.config.json");
		const xdgConfig = join(tmpBase, "xdg-config", "app.config.json");
		writeFileSync(projectConfig, JSON.stringify({ name: "project", port: 8080 }));
		writeFileSync(xdgConfig, JSON.stringify({ name: "global", port: 3000 }));

		const ConfigLayer = makeConfigFileLive({
			tag: TestConfig,
			schema: TestConfigSchema,
			codec: JsonCodec,
			strategy: FirstMatch,
			resolvers: [
				StaticDir({ dir: join(tmpBase, "project"), filename: "app.config.json" }),
				StaticDir({ dir: join(tmpBase, "xdg-config"), filename: "app.config.json" }),
			],
		});

		const sources = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const config = yield* TestConfig;
					return yield* config.discover;
				}),
				Layer.provide(ConfigLayer, NodeFileSystem.layer),
			),
		);
		expect(sources.length).toBe(2);
		expect(sources[0]?.tier).toBe("static");
	});

	it("deep merges with LayeredMerge strategy", async () => {
		const highPriority = join(tmpBase, "project", "app.config.json");
		const lowPriority = join(tmpBase, "xdg-config", "app.config.json");
		writeFileSync(highPriority, JSON.stringify({ name: "project" }));
		writeFileSync(lowPriority, JSON.stringify({ name: "global", port: 3000 }));

		const ConfigLayer = makeConfigFileLive({
			tag: TestConfig,
			schema: TestConfigSchema,
			codec: JsonCodec,
			strategy: LayeredMerge,
			resolvers: [
				StaticDir({ dir: join(tmpBase, "project"), filename: "app.config.json" }),
				StaticDir({ dir: join(tmpBase, "xdg-config"), filename: "app.config.json" }),
			],
		});

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const config = yield* TestConfig;
					return yield* config.load;
				}),
				Layer.provide(ConfigLayer, NodeFileSystem.layer),
			),
		);
		expect(result.name).toBe("project");
		expect(result.port).toBe(3000);
	});

	it("writes config to a file", async () => {
		const outputPath = join(tmpBase, "output.json");
		const configPath = join(tmpBase, "project", "app.config.json");
		writeFileSync(configPath, JSON.stringify({ name: "test" }));

		const ConfigLayer = makeConfigFileLive({
			tag: TestConfig,
			schema: TestConfigSchema,
			codec: JsonCodec,
			strategy: FirstMatch,
			resolvers: [ExplicitPath(configPath)],
		});

		await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const config = yield* TestConfig;
					yield* config.write({ name: "written", port: 9090 }, outputPath);
				}),
				Layer.provide(ConfigLayer, NodeFileSystem.layer),
			),
		);

		const { readFileSync } = await import("node:fs");
		const written = JSON.parse(readFileSync(outputPath, "utf-8"));
		expect(written.name).toBe("written");
	});
});
