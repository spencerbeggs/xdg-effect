import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Scope } from "effect";
import { Effect, Layer, Option } from "effect";
import { XdgPaths } from "../schemas/XdgPaths.js";
// biome-ignore lint/suspicious/noImportCycles: Test layer intentionally references its service tag
import { XdgResolver } from "../services/XdgResolver.js";

export interface XdgResolverTestOptions {
	readonly home?: string;
	readonly configHome?: string;
	readonly dataHome?: string;
	readonly cacheHome?: string;
	readonly stateHome?: string;
	readonly runtimeDir?: string;
}

const toOption = (value: string | undefined): Option.Option<string> =>
	value !== undefined ? Option.some(value) : Option.none();

const scopedTempDir = Effect.acquireRelease(
	Effect.sync(() => mkdtempSync(join(tmpdir(), "xdg-test-"))),
	(dir) => Effect.sync(() => rmSync(dir, { recursive: true, force: true })),
);

export const XdgResolverTestImpl = (options?: XdgResolverTestOptions): Layer.Layer<XdgResolver, never, Scope.Scope> =>
	Layer.scoped(
		XdgResolver,
		Effect.gen(function* () {
			const home = options?.home ?? (yield* scopedTempDir);
			const configHome = toOption(options?.configHome);
			const dataHome = toOption(options?.dataHome);
			const cacheHome = toOption(options?.cacheHome);
			const stateHome = toOption(options?.stateHome);
			const runtimeDir = toOption(options?.runtimeDir);

			return XdgResolver.of({
				home: Effect.succeed(home),
				configHome: Effect.succeed(configHome),
				dataHome: Effect.succeed(dataHome),
				cacheHome: Effect.succeed(cacheHome),
				stateHome: Effect.succeed(stateHome),
				runtimeDir: Effect.succeed(runtimeDir),
				resolveAll: Effect.succeed(new XdgPaths({ home, configHome, dataHome, cacheHome, stateHome, runtimeDir })),
			});
		}),
	);
