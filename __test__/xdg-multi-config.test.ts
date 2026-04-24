import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { ConfigFile, ExplicitPath, FirstMatch, JsonCodec, TomlCodec } from "config-file-effect";
import { ConfigProvider, Effect, Layer, Schema } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppDirsConfig, XdgConfigLive } from "../src/index.js";

const ConfigSchema = Schema.Struct({ name: Schema.String });
type AppConfig = typeof ConfigSchema.Type;
const AppConfigTag = ConfigFile.Tag<AppConfig>("test/MultiConfig");

const CredsSchema = Schema.Struct({ token: Schema.String });
type Credentials = typeof CredsSchema.Type;
const CredsTag = ConfigFile.Tag<Credentials>("test/MultiCreds");

const tmpDir = `/tmp/xdg-multi-test-${Date.now()}`;

describe("XdgConfigLive.multi", () => {
	beforeEach(() => {
		mkdirSync(tmpDir, { recursive: true });
		writeFileSync(join(tmpDir, "config.toml"), 'name = "my-app"\n');
		writeFileSync(join(tmpDir, "creds.json"), JSON.stringify({ token: "abc123" }));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("provides multiple config services under one XDG layer", async () => {
		const provider = ConfigProvider.fromMap(new Map([["HOME", tmpDir]]));

		const layer = XdgConfigLive.multi({
			app: new AppDirsConfig({ namespace: "multi-test" }),
			configs: [
				{
					tag: AppConfigTag,
					schema: ConfigSchema,
					codec: TomlCodec,
					strategy: FirstMatch,
					resolvers: [ExplicitPath(join(tmpDir, "config.toml"))],
				},
				{
					tag: CredsTag,
					schema: CredsSchema,
					codec: JsonCodec,
					strategy: FirstMatch,
					resolvers: [ExplicitPath(join(tmpDir, "creds.json"))],
				},
			],
		});

		const [config, creds] = await Effect.runPromise(
			Effect.all([
				Effect.gen(function* () {
					const cf = yield* AppConfigTag;
					return yield* cf.load;
				}),
				Effect.gen(function* () {
					const cf = yield* CredsTag;
					return yield* cf.load;
				}),
			]).pipe(Effect.withConfigProvider(provider), Effect.provide(Layer.provide(layer, NodeFileSystem.layer))),
		);

		expect(config.name).toBe("my-app");
		expect(creds.token).toBe("abc123");
	});
});
