import type { Effect, Option } from "effect";
import { Context } from "effect";
import type { XdgError } from "../errors/XdgError.js";
// biome-ignore lint/suspicious/noImportCycles: service class intentionally co-locates its Live layer
import { XdgResolverLiveImpl } from "../layers/XdgResolverLive.js";
// biome-ignore lint/suspicious/noImportCycles: service class intentionally co-locates its Test layer
import { XdgResolverTestImpl } from "../layers/XdgResolverTest.js";
import type { XdgPaths } from "../schemas/XdgPaths.js";

export interface XdgResolverService {
	readonly configHome: Effect.Effect<Option.Option<string>>;
	readonly dataHome: Effect.Effect<Option.Option<string>>;
	readonly cacheHome: Effect.Effect<Option.Option<string>>;
	readonly stateHome: Effect.Effect<Option.Option<string>>;
	readonly runtimeDir: Effect.Effect<Option.Option<string>>;
	readonly home: Effect.Effect<string, XdgError>;
	readonly resolveAll: Effect.Effect<XdgPaths, XdgError>;
}

export class XdgResolver extends Context.Tag("xdg-effect/XdgResolver")<XdgResolver, XdgResolverService>() {
	static get Live() {
		return XdgResolverLiveImpl();
	}
	static Test = XdgResolverTestImpl;
}
