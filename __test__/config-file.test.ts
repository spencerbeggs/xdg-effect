import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Layer, Schema } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonCodec } from "../src/codecs/JsonCodec.js";
import { ExplicitPath } from "../src/resolvers/ExplicitPath.js";
import { StaticDir } from "../src/resolvers/StaticDir.js";
import { ConfigFile } from "../src/services/ConfigFile.js";
import { FirstMatch } from "../src/strategies/FirstMatch.js";
import { LayeredMerge } from "../src/strategies/LayeredMerge.js";

const TestConfigSchema = Schema.Struct({
	name: Schema.String,
	port: Schema.optional(Schema.Number),
});
type TestConfig = typeof TestConfigSchema.Type;

const TestConfig = ConfigFile.Tag<TestConfig>("test/Config");

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

		const ConfigLayer = ConfigFile.Live({
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

		const ConfigLayer = ConfigFile.Live({
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

		const ConfigLayer = ConfigFile.Live({
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

		const ConfigLayer = ConfigFile.Live({
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

	it("loadOrDefault returns default when no config file exists", async () => {
		const ConfigLayer = ConfigFile.Live({
			tag: TestConfig,
			schema: TestConfigSchema,
			codec: JsonCodec,
			strategy: FirstMatch,
			resolvers: [StaticDir({ dir: `${tmpBase}/nonexistent`, filename: "app.config.json" })],
		});

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const config = yield* TestConfig;
					return yield* config.loadOrDefault({ name: "default-name" });
				}),
				Layer.provide(ConfigLayer, NodeFileSystem.layer),
			),
		);
		expect(result.name).toBe("default-name");
	});

	it("loadOrDefault returns parsed value when config file exists", async () => {
		const configPath = join(tmpBase, "project", "app.config.json");
		writeFileSync(configPath, JSON.stringify({ name: "from-file", port: 4000 }));

		const ConfigLayer = ConfigFile.Live({
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
					return yield* config.loadOrDefault({ name: "default-name" });
				}),
				Layer.provide(ConfigLayer, NodeFileSystem.layer),
			),
		);
		expect(result.name).toBe("from-file");
		expect(result.port).toBe(4000);
	});

	it("loadOrDefault propagates parse errors for corrupt files", async () => {
		const configPath = join(tmpBase, "project", "corrupt.json");
		writeFileSync(configPath, "not valid json {{{");

		const ConfigLayer = ConfigFile.Live({
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
					return yield* config.loadOrDefault({ name: "default-name" }).pipe(Effect.flip);
				}),
				Layer.provide(ConfigLayer, NodeFileSystem.layer),
			),
		);
		expect(result._tag).toBe("ConfigError");
		expect(result.operation).toBe("parse");
	});

	it("save writes to defaultPath and returns the path", async () => {
		const savePath = join(tmpBase, "save-target", "app.config.json");
		const dummySourcePath = join(tmpBase, "project", "app.config.json");
		writeFileSync(dummySourcePath, JSON.stringify({ name: "source" }));

		const ConfigLayer = ConfigFile.Live({
			tag: TestConfig,
			schema: TestConfigSchema,
			codec: JsonCodec,
			strategy: FirstMatch,
			resolvers: [ExplicitPath(dummySourcePath)],
			defaultPath: Effect.succeed(savePath),
		});

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const config = yield* TestConfig;
					return yield* config.save({ name: "saved", port: 5000 });
				}),
				Layer.provide(ConfigLayer, NodeFileSystem.layer),
			),
		);
		expect(result).toBe(savePath);

		const { readFileSync } = await import("node:fs");
		const written = JSON.parse(readFileSync(savePath, "utf-8"));
		expect(written.name).toBe("saved");
		expect(written.port).toBe(5000);
	});

	it("save creates parent directories if they do not exist", async () => {
		const savePath = join(tmpBase, "deep", "nested", "dir", "app.config.json");

		const ConfigLayer = ConfigFile.Live({
			tag: TestConfig,
			schema: TestConfigSchema,
			codec: JsonCodec,
			strategy: FirstMatch,
			resolvers: [],
			defaultPath: Effect.succeed(savePath),
		});

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const config = yield* TestConfig;
					return yield* config.save({ name: "deep-save" });
				}),
				Layer.provide(ConfigLayer, NodeFileSystem.layer),
			),
		);
		expect(result).toBe(savePath);

		const { readFileSync } = await import("node:fs");
		const written = JSON.parse(readFileSync(savePath, "utf-8"));
		expect(written.name).toBe("deep-save");
	});

	it("save fails with ConfigError when no defaultPath configured", async () => {
		const dummySourcePath = join(tmpBase, "project", "app.config.json");
		writeFileSync(dummySourcePath, JSON.stringify({ name: "source" }));

		const ConfigLayer = ConfigFile.Live({
			tag: TestConfig,
			schema: TestConfigSchema,
			codec: JsonCodec,
			strategy: FirstMatch,
			resolvers: [ExplicitPath(dummySourcePath)],
		});

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const config = yield* TestConfig;
					return yield* config.save({ name: "no-path" }).pipe(Effect.flip);
				}),
				Layer.provide(ConfigLayer, NodeFileSystem.layer),
			),
		);
		expect(result._tag).toBe("ConfigError");
		expect(result.operation).toBe("save");
		expect(result.reason).toBe("no default path configured");
	});

	it("update modifies existing config and saves", async () => {
		const savePath = join(tmpBase, "update-target", "app.config.json");
		const sourcePath = join(tmpBase, "project", "app.config.json");
		writeFileSync(sourcePath, JSON.stringify({ name: "original", port: 3000 }));

		const ConfigLayer = ConfigFile.Live({
			tag: TestConfig,
			schema: TestConfigSchema,
			codec: JsonCodec,
			strategy: FirstMatch,
			resolvers: [ExplicitPath(sourcePath)],
			defaultPath: Effect.succeed(savePath),
		});

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const config = yield* TestConfig;
					return yield* config.update((current) => ({ ...current, port: 9090 }));
				}),
				Layer.provide(ConfigLayer, NodeFileSystem.layer),
			),
		);
		expect(result.name).toBe("original");
		expect(result.port).toBe(9090);

		const { readFileSync } = await import("node:fs");
		const written = JSON.parse(readFileSync(savePath, "utf-8"));
		expect(written.name).toBe("original");
		expect(written.port).toBe(9090);
	});

	it("update uses defaultValue when no config file exists", async () => {
		const savePath = join(tmpBase, "update-new", "app.config.json");

		const ConfigLayer = ConfigFile.Live({
			tag: TestConfig,
			schema: TestConfigSchema,
			codec: JsonCodec,
			strategy: FirstMatch,
			resolvers: [StaticDir({ dir: `${tmpBase}/nonexistent`, filename: "app.config.json" })],
			defaultPath: Effect.succeed(savePath),
		});

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const config = yield* TestConfig;
					return yield* config.update((current) => ({ ...current, port: 7070 }), { name: "default-name" });
				}),
				Layer.provide(ConfigLayer, NodeFileSystem.layer),
			),
		);
		expect(result.name).toBe("default-name");
		expect(result.port).toBe(7070);

		const { readFileSync } = await import("node:fs");
		const written = JSON.parse(readFileSync(savePath, "utf-8"));
		expect(written.name).toBe("default-name");
		expect(written.port).toBe(7070);
	});

	it("update fails when no file exists and no defaultValue provided", async () => {
		const savePath = join(tmpBase, "update-fail", "app.config.json");

		const ConfigLayer = ConfigFile.Live({
			tag: TestConfig,
			schema: TestConfigSchema,
			codec: JsonCodec,
			strategy: FirstMatch,
			resolvers: [StaticDir({ dir: `${tmpBase}/nonexistent`, filename: "app.config.json" })],
			defaultPath: Effect.succeed(savePath),
		});

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const config = yield* TestConfig;
					return yield* config.update((current) => ({ ...current, port: 1 })).pipe(Effect.flip);
				}),
				Layer.provide(ConfigLayer, NodeFileSystem.layer),
			),
		);
		expect(result._tag).toBe("ConfigError");
		expect(result.operation).toBe("resolve");
	});
});

describe("ConfigFile.Test", () => {
	it("loads pre-populated files", async () => {
		const tag = ConfigFile.Tag<TestConfig>("test/Scoped");
		const result = await Effect.runPromise(
			Effect.scoped(
				Effect.provide(
					Effect.gen(function* () {
						const config = yield* tag;
						return yield* config.load;
					}),
					ConfigFile.Test({
						tag,
						schema: TestConfigSchema,
						codec: JsonCodec,
						strategy: FirstMatch,
						resolvers: [ExplicitPath("/tmp/xdg-cftest/app.json")],
						files: {
							"/tmp/xdg-cftest/app.json": JSON.stringify({ name: "pre-populated", port: 8080 }),
						},
					}),
				),
			),
		);
		expect(result.name).toBe("pre-populated");
		expect(result.port).toBe(8080);
	});

	it("returns default when no files pre-populated", async () => {
		const tag = ConfigFile.Tag<TestConfig>("test/Default");
		const result = await Effect.runPromise(
			Effect.scoped(
				Effect.provide(
					Effect.gen(function* () {
						const config = yield* tag;
						return yield* config.loadOrDefault({ name: "fallback" });
					}),
					ConfigFile.Test({
						tag,
						schema: TestConfigSchema,
						codec: JsonCodec,
						strategy: FirstMatch,
						resolvers: [StaticDir({ dir: "/nonexistent", filename: "app.json" })],
					}),
				),
			),
		);
		expect(result.name).toBe("fallback");
	});
});
