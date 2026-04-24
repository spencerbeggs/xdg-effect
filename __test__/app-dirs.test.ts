import { existsSync, rmSync } from "node:fs";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Layer, Option } from "effect";
import { describe, expect, it } from "vitest";
import { AppDirsConfig } from "../src/schemas/AppDirsConfig.js";
import { AppDirs } from "../src/services/AppDirs.js";
import { XdgResolver } from "../src/services/XdgResolver.js";

const makeTestLayer = (config: typeof AppDirsConfig.Type) =>
	Layer.provide(AppDirs.Live(config), Layer.mergeAll(XdgResolver.Live, NodeFileSystem.layer));

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
		const result = await Effect.runPromise(
			Effect.scoped(
				Effect.provide(
					Effect.gen(function* () {
						const appDirs = yield* AppDirs;
						return yield* appDirs.resolveAll;
					}),
					AppDirs.Test({ namespace: "test-app", fallbackDir: Option.none(), dirs: Option.none() }),
				),
			),
		);
		// AppDirs.Test uses XdgResolverTest which sets a temp dir as HOME with no XDG vars
		// so falls back to $HOME/.{namespace}
		expect(result.config).toContain("test-app");
	});

	it("accepts minimal constructor with just namespace", async () => {
		const config = new AppDirsConfig({ namespace: "minimal-app" });
		expect(config.namespace).toBe("minimal-app");
		expect(Option.isNone(config.fallbackDir)).toBe(true);
		expect(Option.isNone(config.dirs)).toBe(true);
	});

	it("accepts constructor with partial fields", async () => {
		const config = new AppDirsConfig({
			namespace: "partial-app",
			fallbackDir: Option.some(".partial-app"),
		});
		expect(config.namespace).toBe("partial-app");
		expect(Option.isSome(config.fallbackDir)).toBe(true);
		expect(Option.isNone(config.dirs)).toBe(true);
	});

	it("ensureConfig creates only the config directory", async () => {
		const testDir = `/tmp/xdg-effect-test-${Date.now()}`;
		const config = new AppDirsConfig({
			namespace: "test-app",
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
					return yield* appDirs.ensureConfig;
				}),
				makeTestLayer(config),
			),
		);
		expect(result).toBe(`${testDir}/config`);

		expect(existsSync(`${testDir}/config`)).toBe(true);
		expect(existsSync(`${testDir}/data`)).toBe(false);
		expect(existsSync(`${testDir}/cache`)).toBe(false);
		expect(existsSync(`${testDir}/state`)).toBe(false);
		rmSync(testDir, { recursive: true, force: true });
	});

	it("ensureData creates only the data directory", async () => {
		const testDir = `/tmp/xdg-effect-test-${Date.now()}`;
		const config = new AppDirsConfig({
			namespace: "test-app",
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
					return yield* appDirs.ensureData;
				}),
				makeTestLayer(config),
			),
		);
		expect(result).toBe(`${testDir}/data`);

		expect(existsSync(`${testDir}/data`)).toBe(true);
		expect(existsSync(`${testDir}/config`)).toBe(false);
		rmSync(testDir, { recursive: true, force: true });
	});

	it("ensureCache creates only the cache directory", async () => {
		const testDir = `/tmp/xdg-effect-test-${Date.now()}`;
		const config = new AppDirsConfig({
			namespace: "test-app",
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
					return yield* appDirs.ensureCache;
				}),
				makeTestLayer(config),
			),
		);
		expect(result).toBe(`${testDir}/cache`);

		expect(existsSync(`${testDir}/cache`)).toBe(true);
		expect(existsSync(`${testDir}/config`)).toBe(false);
		rmSync(testDir, { recursive: true, force: true });
	});

	it("ensureState creates only the state directory", async () => {
		const testDir = `/tmp/xdg-effect-test-${Date.now()}`;
		const config = new AppDirsConfig({
			namespace: "test-app",
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
					return yield* appDirs.ensureState;
				}),
				makeTestLayer(config),
			),
		);
		expect(result).toBe(`${testDir}/state`);

		expect(existsSync(`${testDir}/state`)).toBe(true);
		expect(existsSync(`${testDir}/config`)).toBe(false);
		rmSync(testDir, { recursive: true, force: true });
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

		rmSync(testDir, { recursive: true, force: true });
	});
});

describe("AppDirs.Test", () => {
	it("provides scoped app dirs with auto-cleanup", async () => {
		let capturedConfig = "";
		await Effect.runPromise(
			Effect.scoped(
				Effect.provide(
					Effect.gen(function* () {
						const appDirs = yield* AppDirs;
						capturedConfig = yield* appDirs.ensureConfig;
						expect(existsSync(capturedConfig)).toBe(true);
					}),
					AppDirs.Test({ namespace: "test-app" }),
				),
			),
		);
		expect(existsSync(capturedConfig)).toBe(false);
	});

	it("resolves all directories under scoped temp dir", async () => {
		const result = await Effect.runPromise(
			Effect.scoped(
				Effect.provide(
					Effect.gen(function* () {
						const appDirs = yield* AppDirs;
						return yield* appDirs.resolveAll;
					}),
					AppDirs.Test({ namespace: "test-app" }),
				),
			),
		);
		expect(result.config).toContain("test-app");
		expect(result.data).toContain("test-app");
		expect(result.cache).toContain("test-app");
		expect(result.state).toContain("test-app");
	});

	it("runtime returns None when XDG_RUNTIME_DIR is not set", async () => {
		const result = await Effect.runPromise(
			Effect.scoped(
				Effect.provide(
					Effect.gen(function* () {
						const appDirs = yield* AppDirs;
						return yield* appDirs.runtime;
					}),
					AppDirs.Test({ namespace: "runtime-test" }),
				),
			),
		);
		expect(Option.isNone(result)).toBe(true);
	});
});
