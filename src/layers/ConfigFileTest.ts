import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import type { Scope } from "effect";
import { Effect, Layer } from "effect";
import type { ConfigFileService } from "../services/ConfigFile.js";
import type { ConfigFileOptions } from "./ConfigFileLive.js";
import { makeConfigFileLiveImpl } from "./ConfigFileLive.js";

export interface ConfigFileTestOptions<A> extends ConfigFileOptions<A> {
	readonly files?: Record<string, string>;
}

export const ConfigFileTestImpl = <A>(
	options: ConfigFileTestOptions<A>,
): Layer.Layer<ConfigFileService<A>, never, Scope.Scope> =>
	Layer.unwrapScoped(
		Effect.gen(function* () {
			if (options.files) {
				const written: string[] = [];
				for (const [path, content] of Object.entries(options.files)) {
					mkdirSync(dirname(path), { recursive: true });
					writeFileSync(path, content);
					written.push(path);
				}
				yield* Effect.addFinalizer(() =>
					Effect.sync(() => {
						for (const p of written) rmSync(p, { force: true });
					}),
				);
			}

			return makeConfigFileLiveImpl(options).pipe(Layer.provide(NodeFileSystem.layer));
		}),
	);
