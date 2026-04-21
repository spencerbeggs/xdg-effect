import { NodeFileSystem } from "@effect/platform-node";
import type { Scope } from "effect";
import { Layer } from "effect";
import { AppDirsConfig } from "../schemas/AppDirsConfig.js";
import type { AppDirs } from "../services/AppDirs.js";
import type { XdgResolver } from "../services/XdgResolver.js";
// biome-ignore lint/suspicious/noImportCycles: Test layer intentionally co-locates with Live layer in the same cycle
import { AppDirsLiveImpl } from "./AppDirsLive.js";
import { XdgResolverTestImpl } from "./XdgResolverTest.js";

export const AppDirsTestImpl = (
	input: ConstructorParameters<typeof AppDirsConfig>[0],
): Layer.Layer<XdgResolver | AppDirs, never, Scope.Scope> => {
	const config = new AppDirsConfig(input);
	const resolverLayer = XdgResolverTestImpl();
	const appDirsLayer = AppDirsLiveImpl(config).pipe(Layer.provide(resolverLayer), Layer.provide(NodeFileSystem.layer));
	return Layer.mergeAll(resolverLayer, appDirsLayer);
};
