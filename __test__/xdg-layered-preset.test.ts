import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { ConfigFile, TomlCodec } from "config-file-effect";
import { ConfigProvider, Effect, Exit, Layer, Schema } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { XdgConfigLive } from "../src/index.js";

const TestSchema = Schema.Struct({ name: Schema.String });
type TestConfig = typeof TestSchema.Type;
const TestTag = ConfigFile.Tag<TestConfig>("test/LayeredConfig");

describe("XdgConfigLive.layered", () => {
	let home: string;
	let originalPlatform: PropertyDescriptor | undefined;

	beforeEach(() => {
		home = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "xdg-layered-"));
		originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
	});

	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
		if (originalPlatform) Object.defineProperty(process, "platform", originalPlatform);
	});

	const layer = (native: boolean, system: boolean) =>
		XdgConfigLive.layered({
			namespace: "layered-test",
			filename: "config.toml",
			tag: TestTag,
			schema: TestSchema,
			codec: TomlCodec,
			native,
			system,
		});

	it("loads from the user tier (dot-namespace fallback)", async () => {
		mkdirSync(join(home, ".layered-test"), { recursive: true });
		writeFileSync(join(home, ".layered-test", "config.toml"), 'name = "from-user"\n');
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const config = yield* TestTag;
				return yield* config.load;
			}).pipe(
				Effect.withConfigProvider(ConfigProvider.fromMap(new Map([["HOME", home]]))),
				Effect.provide(Layer.provide(layer(true, true), NodeFileSystem.layer)),
			),
		);
		expect(result.name).toBe("from-user");
	});

	it("loads from the macOS native tier when native is on", async () => {
		Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
		const dir = join(home, "Library", "Application Support", "layered-test");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "config.toml"), 'name = "from-native"\n');
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const config = yield* TestTag;
				return yield* config.load;
			}).pipe(
				Effect.withConfigProvider(ConfigProvider.fromMap(new Map([["HOME", home]]))),
				Effect.provide(Layer.provide(layer(true, true), NodeFileSystem.layer)),
			),
		);
		expect(result.name).toBe("from-native");
	});

	it("does NOT find the native file when native is off", async () => {
		Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
		const dir = join(home, "Library", "Application Support", "layered-test");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "config.toml"), 'name = "from-native"\n');
		const exit = await Effect.runPromiseExit(
			Effect.gen(function* () {
				const config = yield* TestTag;
				return yield* config.load;
			}).pipe(
				Effect.withConfigProvider(ConfigProvider.fromMap(new Map([["HOME", home]]))),
				Effect.provide(Layer.provide(layer(false, false), NodeFileSystem.layer)),
			),
		);
		expect(Exit.isFailure(exit)).toBe(true);
	});
});
