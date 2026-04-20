import { FileSystem } from "@effect/platform";
import { Effect, Option } from "effect";
import type { ConfigResolver } from "./ConfigResolver.js";

/**
 * Resolver that looks for a file inside a known directory.
 *
 * @remarks
 * Joins `dir` and `filename`, then checks whether the resulting path exists.
 * Returns `Option.some(fullPath)` when found, `Option.none()` otherwise.
 * Filesystem errors are caught and treated as "not found".
 *
 * @public
 */
export const StaticDir = (options: {
	readonly dir: string;
	readonly filename: string;
}): ConfigResolver<FileSystem.FileSystem> => ({
	name: "static",
	resolve: Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const fullPath = `${options.dir}/${options.filename}`;
		const exists = yield* fs.exists(fullPath);
		return exists ? Option.some(fullPath) : Option.none();
	}).pipe(Effect.catchAll(() => Effect.succeed(Option.none()))),
});
