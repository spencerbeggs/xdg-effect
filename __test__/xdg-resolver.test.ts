import { ConfigProvider, Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import { XdgResolver } from "../src/index.js";
import { XdgResolverLive } from "../src/layers/XdgResolverLive.js";

const run = <A, E>(effect: Effect.Effect<A, E, XdgResolver>) =>
	Effect.runPromise(Effect.provide(effect, XdgResolverLive));

describe("XdgResolver", () => {
	it("resolves home directory", async () => {
		const result = await run(
			Effect.gen(function* () {
				const resolver = yield* XdgResolver;
				return yield* resolver.home;
			}),
		);
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});

	it("returns Option for XDG dirs", async () => {
		const result = await run(
			Effect.gen(function* () {
				const resolver = yield* XdgResolver;
				return yield* resolver.configHome;
			}),
		);
		expect(Option.isOption(result)).toBe(true);
	});

	it("resolveAll returns XdgPaths", async () => {
		const result = await run(
			Effect.gen(function* () {
				const resolver = yield* XdgResolver;
				return yield* resolver.resolveAll;
			}),
		);
		expect(typeof result.home).toBe("string");
		expect(Option.isOption(result.configHome)).toBe(true);
		expect(Option.isOption(result.dataHome)).toBe(true);
		expect(Option.isOption(result.cacheHome)).toBe(true);
		expect(Option.isOption(result.stateHome)).toBe(true);
		expect(Option.isOption(result.runtimeDir)).toBe(true);
	});

	it("respects a custom ConfigProvider", async () => {
		const customProvider = ConfigProvider.fromMap(
			new Map([
				["HOME", "/custom/home"],
				["XDG_CONFIG_HOME", "/custom/config"],
			]),
		);

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.withConfigProvider(
					Effect.gen(function* () {
						const resolver = yield* XdgResolver;
						const home = yield* resolver.home;
						const configHome = yield* resolver.configHome;
						return { home, configHome };
					}),
					customProvider,
				),
				XdgResolverLive,
			),
		);
		expect(result.home).toBe("/custom/home");
		expect(Option.getOrThrow(result.configHome)).toBe("/custom/config");
	});

	it("returns None for unset XDG vars", async () => {
		const customProvider = ConfigProvider.fromMap(new Map([["HOME", "/home/user"]]));

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.withConfigProvider(
					Effect.gen(function* () {
						const resolver = yield* XdgResolver;
						return yield* resolver.runtimeDir;
					}),
					customProvider,
				),
				XdgResolverLive,
			),
		);
		expect(Option.isNone(result)).toBe(true);
	});
});
