import type { FileSystem } from "@effect/platform";
import { Layer } from "effect";
import type { AppDirsConfig } from "../schemas/AppDirsConfig.js";
import type { AppDirs } from "../services/AppDirs.js";
import type { ConfigFileService } from "../services/ConfigFile.js";
import { ConfigFile } from "../services/ConfigFile.js";
import type { XdgResolver } from "../services/XdgResolver.js";
import type { ConfigFileOptions } from "./ConfigFileLive.js";
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
 * `ConfigFile.Live` for config file support. Requires `FileSystem`
 * from `@effect/platform`.
 *
 * @public
 */
export const XdgConfigLive = <A>(
	options: XdgConfigLiveOptions<A>,
): Layer.Layer<XdgResolver | AppDirs | ConfigFileService<A>, never, FileSystem.FileSystem> =>
	Layer.mergeAll(XdgLive(options.app), ConfigFile.Live(options.config));
