import { FileSystem } from "@effect/platform";
import type { ConfigResolver } from "config-file-effect";
import { Effect, Option } from "effect";
import { nativeDirs } from "../services/NativeDirs.js";
import { XdgResolver } from "../services/XdgResolver.js";

/**
 * Resolver that looks for a file in the OS-native config directory.
 *
 * @remarks
 * Resolves the native config directory for `namespace` via {@link nativeDirs}
 * (`~/Library/Application Support/<ns>` on macOS, `%APPDATA%\\<ns>` on Windows),
 * then checks whether `filename` exists there. On Linux (and other platforms)
 * `nativeDirs` returns none, so this resolver returns `Option.none()` without
 * probing — the XDG resolver already owns `~/.config` there. Reads `home`,
 * `appData`, and `localAppData` from {@link XdgResolver} and the platform from
 * `process.platform`. Filesystem and resolver errors are caught and treated as
 * "not found".
 *
 * Place it after `XdgConfigResolver` in a resolver chain so an existing
 * `~/.config/<app>` still wins over the native directory.
 *
 * @public
 */
export const NativeConfigResolver = (options: {
	readonly namespace: string;
	readonly filename: string;
}): ConfigResolver<FileSystem.FileSystem | XdgResolver> => ({
	name: "native",
	resolve: Effect.gen(function* () {
		const resolver = yield* XdgResolver;
		const home = yield* resolver.home;
		const appData = yield* resolver.appData;
		const localAppData = yield* resolver.localAppData;
		const native = nativeDirs({
			platform: globalThis.process?.platform ?? "linux",
			home,
			...(Option.isSome(appData) ? { appData: appData.value } : {}),
			...(Option.isSome(localAppData) ? { localAppData: localAppData.value } : {}),
			namespace: options.namespace,
		});
		if (Option.isNone(native)) {
			return Option.none();
		}
		const fs = yield* FileSystem.FileSystem;
		const fullPath = `${native.value.config}/${options.filename}`;
		const exists = yield* fs.exists(fullPath);
		return exists ? Option.some(fullPath) : Option.none();
	}).pipe(Effect.catchAll(() => Effect.succeed(Option.none()))),
});
