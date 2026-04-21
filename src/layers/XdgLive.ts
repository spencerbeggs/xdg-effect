import type { FileSystem } from "@effect/platform";
import { Layer } from "effect";
import type { AppDirsConfig } from "../schemas/AppDirsConfig.js";
import { AppDirs } from "../services/AppDirs.js";
import { XdgResolver } from "../services/XdgResolver.js";

/**
 * Aggregate layer providing {@link XdgResolver} and {@link AppDirs}.
 *
 * @remarks
 * Composes `XdgResolver.Live` and `AppDirs.Live` into a single layer.
 * Requires `FileSystem` from `@effect/platform`.
 *
 * @public
 */
export const XdgLive = (
	config: typeof AppDirsConfig.Type,
): Layer.Layer<XdgResolver | AppDirs, never, FileSystem.FileSystem> => {
	const resolver = XdgResolver.Live;
	return Layer.mergeAll(resolver, AppDirs.Live(config).pipe(Layer.provide(resolver)));
};
