import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Layer, Option } from "effect";
import { describe, expect, it } from "vitest";
import { AppDirsLive } from "../src/layers/AppDirsLive.js";
import { XdgResolverLive } from "../src/layers/XdgResolverLive.js";
import { AppDirsConfig } from "../src/schemas/AppDirsConfig.js";
import { AppDirs } from "../src/services/AppDirs.js";

const makeTestLayer = (config: typeof AppDirsConfig.Type) =>
	Layer.provide(AppDirsLive(config), Layer.mergeAll(XdgResolverLive, NodeFileSystem.layer));

describe("AppDirs", () => {
	it("resolves paths with fallback when XDG vars are not set", async () => {
		const config = new AppDirsConfig({
			namespace: "test-app",
			fallbackDir: Option.some(".test-app"),
			dirs: Option.none(),
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const appDirs = yield* AppDirs;
					return yield* appDirs.resolveAll;
				}),
				makeTestLayer(config),
			),
		);
		expect(typeof result.config).toBe("string");
		expect(typeof result.data).toBe("string");
		expect(typeof result.cache).toBe("string");
		expect(typeof result.state).toBe("string");
	});

	it("uses explicit dir overrides when provided", async () => {
		const config = new AppDirsConfig({
			namespace: "test-app",
			fallbackDir: Option.none(),
			dirs: Option.some({
				config: Option.some("/tmp/xdg-test/config"),
				data: Option.some("/tmp/xdg-test/data"),
				cache: Option.some("/tmp/xdg-test/cache"),
				state: Option.some("/tmp/xdg-test/state"),
				runtime: Option.none(),
			}),
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const appDirs = yield* AppDirs;
					return yield* appDirs.resolveAll;
				}),
				makeTestLayer(config),
			),
		);
		expect(result.config).toBe("/tmp/xdg-test/config");
		expect(result.data).toBe("/tmp/xdg-test/data");
		expect(result.cache).toBe("/tmp/xdg-test/cache");
		expect(result.state).toBe("/tmp/xdg-test/state");
	});

	it("falls back to $HOME/.namespace when no XDG and no fallbackDir", async () => {
		const config = new AppDirsConfig({
			namespace: "test-app",
			fallbackDir: Option.none(),
			dirs: Option.none(),
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const appDirs = yield* AppDirs;
					return yield* appDirs.resolveAll;
				}),
				makeTestLayer(config),
			),
		);
		// When no XDG vars and no fallbackDir, falls back to $HOME/.{namespace}
		const home = process.env.HOME ?? "";
		const xdgConfig = process.env.XDG_CONFIG_HOME;
		if (xdgConfig) {
			expect(result.config).toBe(`${xdgConfig}/test-app`);
		} else {
			expect(result.config).toBe(`${home}/.test-app`);
		}
	});

	it("ensure creates directories", async () => {
		const testDir = `/tmp/xdg-effect-test-${Date.now()}`;
		const config = new AppDirsConfig({
			namespace: "test-app",
			fallbackDir: Option.none(),
			dirs: Option.some({
				config: Option.some(`${testDir}/config`),
				data: Option.some(`${testDir}/data`),
				cache: Option.some(`${testDir}/cache`),
				state: Option.some(`${testDir}/state`),
				runtime: Option.none(),
			}),
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const appDirs = yield* AppDirs;
					return yield* appDirs.ensure;
				}),
				makeTestLayer(config),
			),
		);
		expect(result.config).toBe(`${testDir}/config`);

		// Cleanup
		const { rmSync } = await import("node:fs");
		rmSync(testDir, { recursive: true, force: true });
	});
});
