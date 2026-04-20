import { FileSystem } from "@effect/platform";
import { Effect, Option } from "effect";
import { AppDirs } from "../services/AppDirs.js";
import type { ConfigResolver } from "./ConfigResolver.js";

/**
 * Resolver that looks for a file in the XDG config directory.
 *
 * @remarks
 * Uses the {@link AppDirs} service to determine the XDG config directory, then
 * checks whether `filename` exists there. Returns `Option.some(fullPath)` when
 * found, `Option.none()` otherwise. Filesystem and AppDirs errors are caught
 * and treated as "not found".
 *
 * @public
 */
export const XdgConfig = (options: { readonly filename: string }): ConfigResolver<FileSystem.FileSystem | AppDirs> => ({
	name: "xdg",
	resolve: Effect.gen(function* () {
		const appDirs = yield* AppDirs;
		const configDir = yield* appDirs.config;
		const fs = yield* FileSystem.FileSystem;
		const fullPath = `${configDir}/${options.filename}`;
		const exists = yield* fs.exists(fullPath);
		return exists ? Option.some(fullPath) : Option.none();
	}).pipe(Effect.catchAll(() => Effect.succeed(Option.none()))),
});
