import type { FileSystem } from "@effect/platform";
import { Layer } from "effect";
import type { AppDirsConfig } from "../schemas/AppDirsConfig.js";
import { AppDirsLive } from "./AppDirsLive.js";
import { XdgResolverLive } from "./XdgResolverLive.js";

/**
 * Aggregate layer providing {@link XdgResolver} and {@link AppDirs}.
 *
 * @remarks
 * Composes `XdgResolverLive` and `AppDirsLive` into a single layer.
 * Requires `FileSystem` from `@effect/platform`.
 *
 * @public
 */
export const XdgLive = (
	config: typeof AppDirsConfig.Type,
): Layer.Layer<
	import("../services/XdgResolver.js").XdgResolver | import("../services/AppDirs.js").AppDirs,
	never,
	FileSystem.FileSystem
> => Layer.mergeAll(XdgResolverLive, AppDirsLive(config).pipe(Layer.provide(XdgResolverLive)));
