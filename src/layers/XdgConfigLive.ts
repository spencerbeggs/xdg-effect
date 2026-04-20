import type { FileSystem } from "@effect/platform";
import { Layer } from "effect";
import type { AppDirsConfig } from "../schemas/AppDirsConfig.js";
import type { ConfigFileOptions } from "./ConfigFileLive.js";
import { makeConfigFileLive } from "./ConfigFileLive.js";
import { XdgLive } from "./XdgLive.js";

/**
 * Options for {@link XdgConfigLive}.
 *
 * @public
 */
export interface XdgConfigLiveOptions<A> {
	readonly app: typeof AppDirsConfig.Type;
	readonly config: ConfigFileOptions<A>;
}

/**
 * Aggregate layer providing {@link XdgResolver}, {@link AppDirs}, and a
 * {@link ConfigFileService}.
 *
 * @remarks
 * Composes `XdgLive` (which provides XdgResolver + AppDirs) with
 * `makeConfigFileLive` for config file support. Requires `FileSystem`
 * from `@effect/platform`.
 *
 * @public
 */
export const XdgConfigLive = <A>(
	options: XdgConfigLiveOptions<A>,
): Layer.Layer<
	| import("../services/XdgResolver.js").XdgResolver
	| import("../services/AppDirs.js").AppDirs
	| import("../services/ConfigFile.js").ConfigFileService<A>,
	never,
	FileSystem.FileSystem
> => Layer.mergeAll(XdgLive(options.app), makeConfigFileLive(options.config));
