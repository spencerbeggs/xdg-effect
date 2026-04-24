import { writeFileSync } from "node:fs";
import { NodeFileSystem } from "@effect/platform-node";
import type { ConfigError } from "config-file-effect";
import { Effect, Exit, Layer, Option } from "effect";
import { describe, expect, it } from "vitest";
import { AppDirs, AppDirsError, XdgConfigResolver, XdgSavePath } from "../src/index.js";

const FailingAppDirs = Layer.succeed(
	AppDirs,
	AppDirs.of({
		config: Effect.fail(new AppDirsError({ directory: "config", reason: "test" })),
		data: Effect.fail(new AppDirsError({ directory: "data", reason: "test" })),
		cache: Effect.fail(new AppDirsError({ directory: "cache", reason: "test" })),
		state: Effect.fail(new AppDirsError({ directory: "state", reason: "test" })),
		runtime: Effect.fail(new AppDirsError({ directory: "runtime", reason: "test" })),
		ensureConfig: Effect.fail(new AppDirsError({ directory: "config", reason: "test" })),
		ensureData: Effect.fail(new AppDirsError({ directory: "data", reason: "test" })),
		ensureCache: Effect.fail(new AppDirsError({ directory: "cache", reason: "test" })),
		ensureState: Effect.fail(new AppDirsError({ directory: "state", reason: "test" })),
		resolveAll: Effect.fail(new AppDirsError({ directory: "all", reason: "test" })),
		ensure: Effect.fail(new AppDirsError({ directory: "all", reason: "test" })),
	}),
);

describe("XdgConfigResolver", () => {
	it("returns Option.some(path) when the config file exists", async () => {
		const resolver = XdgConfigResolver({ filename: "config.toml" });

		const result = await Effect.runPromise(
			Effect.scoped(
				Effect.provide(
					Effect.gen(function* () {
						const appDirs = yield* AppDirs;
						const configDir = yield* appDirs.ensureConfig;
						writeFileSync(`${configDir}/config.toml`, "[section]\nkey = 'value'\n");
						return yield* resolver.resolve;
					}),
					Layer.mergeAll(AppDirs.Test({ namespace: "xdg-bridges-test" }), NodeFileSystem.layer),
				),
			),
		);

		expect(Option.isSome(result)).toBe(true);
		expect(Option.getOrThrow(result)).toMatch(/config\.toml$/);
		expect(Option.getOrThrow(result)).toContain("xdg-bridges-test");
	});

	it("returns Option.none() when the config file does not exist", async () => {
		const resolver = XdgConfigResolver({ filename: "config.toml" });

		const result = await Effect.runPromise(
			Effect.scoped(
				Effect.provide(
					resolver.resolve,
					Layer.mergeAll(AppDirs.Test({ namespace: "xdg-bridges-test-missing" }), NodeFileSystem.layer),
				),
			),
		);

		expect(Option.isNone(result)).toBe(true);
	});

	it("swallows AppDirs errors and returns Option.none()", async () => {
		const resolver = XdgConfigResolver({ filename: "config.toml" });

		const result = await Effect.runPromise(
			Effect.provide(resolver.resolve, Layer.mergeAll(FailingAppDirs, NodeFileSystem.layer)),
		);

		expect(Option.isNone(result)).toBe(true);
	});
});

describe("XdgSavePath", () => {
	it("returns a path ending with the filename containing the namespace", async () => {
		const result = await Effect.runPromise(
			Effect.scoped(Effect.provide(XdgSavePath("config.toml"), AppDirs.Test({ namespace: "xdg-save-test" }))),
		);

		expect(result).toMatch(/config\.toml$/);
		expect(result).toContain("xdg-save-test");
	});

	it("maps AppDirsError to ConfigError with operation 'save'", async () => {
		const exit = await Effect.runPromiseExit(Effect.provide(XdgSavePath("config.toml"), FailingAppDirs));

		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			const cause = exit.cause;
			const error = (cause as { _tag: string; error: unknown }).error as ConfigError;
			expect(error._tag).toBe("ConfigError");
			expect(error.operation).toBe("save");
		}
	});
});
