import { Config, Effect, Layer, Option } from "effect";
import { XdgError } from "../errors/XdgError.js";
import { XdgPaths } from "../schemas/XdgPaths.js";
import { XdgResolver } from "../services/XdgResolver.js";

const optionalEnv = (name: string): Effect.Effect<Option.Option<string>> =>
	Config.string(name).pipe(
		Effect.map(Option.some),
		Effect.catchAll(() => Effect.succeed(Option.none<string>())),
	);

const requiredHome: Effect.Effect<string, XdgError> = Config.string("HOME").pipe(
	Effect.mapError(() => new XdgError({ message: "HOME environment variable is not set" })),
);

export const XdgResolverLive: Layer.Layer<XdgResolver> = Layer.succeed(
	XdgResolver,
	XdgResolver.of({
		configHome: optionalEnv("XDG_CONFIG_HOME"),
		dataHome: optionalEnv("XDG_DATA_HOME"),
		cacheHome: optionalEnv("XDG_CACHE_HOME"),
		stateHome: optionalEnv("XDG_STATE_HOME"),
		runtimeDir: optionalEnv("XDG_RUNTIME_DIR"),
		home: requiredHome,
		resolveAll: Effect.gen(function* () {
			const [home, configHome, dataHome, cacheHome, stateHome, runtimeDir] = yield* Effect.all([
				requiredHome,
				optionalEnv("XDG_CONFIG_HOME"),
				optionalEnv("XDG_DATA_HOME"),
				optionalEnv("XDG_CACHE_HOME"),
				optionalEnv("XDG_STATE_HOME"),
				optionalEnv("XDG_RUNTIME_DIR"),
			]);
			return new XdgPaths({
				home,
				configHome,
				dataHome,
				cacheHome,
				stateHome,
				runtimeDir,
			});
		}),
	}),
);
