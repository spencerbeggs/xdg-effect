import type { FileSystem } from "@effect/platform";
import type { SqlClient } from "@effect/sql";
import { Layer } from "effect";
import type { AppDirsConfig } from "../schemas/AppDirsConfig.js";
import type { AppDirs } from "../services/AppDirs.js";
import type { ConfigFileService } from "../services/ConfigFile.js";
import { SqliteCache } from "../services/SqliteCache.js";
import type { StateMigration } from "../services/SqliteState.js";
import { SqliteState } from "../services/SqliteState.js";
import type { XdgResolver } from "../services/XdgResolver.js";
import type { ConfigFileOptions } from "./ConfigFileLive.js";
import { XdgConfigLive } from "./XdgConfigLive.js";

/**
 * Options for {@link XdgFullLive}.
 *
 * @public
 */
export interface XdgFullLiveOptions<A> {
	readonly app: typeof AppDirsConfig.Type;
	readonly config: ConfigFileOptions<A>;
	readonly migrations: ReadonlyArray<StateMigration>;
}

/**
 * Aggregate layer providing the full xdg-effect stack:
 * {@link XdgResolver}, {@link AppDirs}, {@link ConfigFileService},
 * {@link SqliteCache}, and {@link SqliteState}.
 *
 * @remarks
 * Composes `XdgConfigLive` with `SqliteCache.Live` and `SqliteState.Live`.
 * Requires `FileSystem` from `@effect/platform` and `SqlClient` from `@effect/sql`.
 *
 * Both `SqliteCache` and `SqliteState` share the same `SqlClient` instance.
 * The caller is responsible for providing an appropriate `SqlClient` layer
 * (e.g., `SqliteLive` from `@effect/sql-sqlite-node`).
 *
 * @public
 */
export const XdgFullLive = <A>(
	options: XdgFullLiveOptions<A>,
): Layer.Layer<
	XdgResolver | AppDirs | ConfigFileService<A> | SqliteCache | SqliteState,
	never,
	FileSystem.FileSystem | SqlClient.SqlClient
> =>
	Layer.mergeAll(
		XdgConfigLive({ app: options.app, config: options.config }),
		SqliteCache.Live(),
		SqliteState.Live({ migrations: options.migrations }),
	);
