import { ConfigError } from "config-file-effect";
import { Effect } from "effect";
import { AppDirs } from "../services/AppDirs.js";

/**
 * Resolves the default save path for a config file in the XDG config directory.
 *
 * @remarks
 * Combines the app's XDG config directory (from {@link AppDirs}) with the
 * provided `filename`. Intended for use as the `defaultPath` option in
 * {@link ConfigFileOptions} to enable {@link ConfigFileService.save}.
 *
 * @public
 */
export const XdgSavePath = (filename: string): Effect.Effect<string, ConfigError, AppDirs> =>
	Effect.gen(function* () {
		const appDirs = yield* AppDirs;
		const configDir = yield* appDirs.config.pipe(
			Effect.mapError(
				(e) =>
					new ConfigError({
						operation: "save",
						reason: e.reason,
					}),
			),
		);
		return `${configDir}/${filename}`;
	});
