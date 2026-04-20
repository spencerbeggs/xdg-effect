import { FileSystem } from "@effect/platform";
import { Effect, Option } from "effect";
import type { ConfigResolver } from "./ConfigResolver.js";

/**
 * Resolver that walks up the directory tree looking for a file.
 *
 * @remarks
 * Starting from `cwd` (defaults to `process.cwd()`), checks each directory for
 * `filename`. Stops when the file is found, the filesystem root is reached, or
 * the `stopAt` boundary is hit. Returns `Option.some(path)` when found,
 * `Option.none()` otherwise. Filesystem errors are caught and treated as
 * "not found".
 *
 * @public
 */
export const UpwardWalk = (options: {
	readonly filename: string;
	readonly cwd?: string;
	readonly stopAt?: string;
}): ConfigResolver<FileSystem.FileSystem> => ({
	name: "walk",
	resolve: Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		let current = options.cwd ?? globalThis.process?.cwd?.() ?? "/";

		while (true) {
			const candidate = `${current}/${options.filename}`;
			const exists = yield* fs.exists(candidate);
			if (exists) {
				return Option.some(candidate);
			}

			if (options.stopAt && current === options.stopAt) {
				break;
			}

			const parent = current.replace(/\/[^/]+$/, "") || "/";
			if (parent === current) {
				break;
			}
			current = parent;
		}

		return Option.none();
	}).pipe(Effect.catchAll(() => Effect.succeed(Option.none()))),
});
