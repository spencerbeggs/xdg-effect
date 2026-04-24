import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { ConfigFile } from "config-file-effect";
import { ConfigProvider, Effect, Layer, Schema } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { XdgConfigLive } from "../src/index.js";

const TestSchema = Schema.Struct({ name: Schema.String, port: Schema.optional(Schema.Number) });
type TestConfig = typeof TestSchema.Type;
const TestTag = ConfigFile.Tag<TestConfig>("test/PresetConfig");

const tmpDir = `/tmp/xdg-preset-test-${Date.now()}`;

describe("XdgConfigLive.toml", () => {
	beforeEach(() => {
		// AppDirs with namespace "preset-test" and HOME=tmpDir resolves config to tmpDir/.preset-test
		mkdirSync(join(tmpDir, ".preset-test"), { recursive: true });
		writeFileSync(join(tmpDir, ".preset-test", "config.toml"), 'name = "from-toml"\nport = 8080\n');
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("loads TOML config with preset defaults", async () => {
		const provider = ConfigProvider.fromMap(new Map([["HOME", tmpDir]]));

		const layer = XdgConfigLive.toml({
			namespace: "preset-test",
			filename: "config.toml",
			tag: TestTag,
			schema: TestSchema,
		});

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const config = yield* TestTag;
				return yield* config.load;
			}).pipe(Effect.withConfigProvider(provider), Effect.provide(Layer.provide(layer, NodeFileSystem.layer))),
		);
		expect(result.name).toBe("from-toml");
		expect(result.port).toBe(8080);
	});
});

describe("XdgConfigLive.json", () => {
	beforeEach(() => {
		mkdirSync(join(tmpDir, ".preset-test"), { recursive: true });
		writeFileSync(join(tmpDir, ".preset-test", "config.json"), JSON.stringify({ name: "from-json", port: 3000 }));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("loads JSON config with preset defaults", async () => {
		const provider = ConfigProvider.fromMap(new Map([["HOME", tmpDir]]));

		const layer = XdgConfigLive.json({
			namespace: "preset-test",
			filename: "config.json",
			tag: TestTag,
			schema: TestSchema,
		});

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const config = yield* TestTag;
				return yield* config.load;
			}).pipe(Effect.withConfigProvider(provider), Effect.provide(Layer.provide(layer, NodeFileSystem.layer))),
		);
		expect(result.name).toBe("from-json");
		expect(result.port).toBe(3000);
	});
});
