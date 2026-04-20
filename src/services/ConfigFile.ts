import type { Effect } from "effect";
import { Context } from "effect";
import type { ConfigError } from "../errors/ConfigError.js";
import type { ConfigSource } from "../strategies/ConfigWalkStrategy.js";

/**
 * Service interface for loading, discovering, and writing configuration files.
 *
 * @remarks
 * Generic over the configuration value type `A`. Use {@link makeConfigFileTag}
 * to create a unique `Context.Tag` for each config schema.
 *
 * @public
 */
export interface ConfigFileService<A> {
	readonly load: Effect.Effect<A, ConfigError>;
	readonly loadFrom: (path: string) => Effect.Effect<A, ConfigError>;
	readonly discover: Effect.Effect<ReadonlyArray<ConfigSource<A>>, ConfigError>;
	readonly write: (value: A, path: string) => Effect.Effect<void, ConfigError>;
}

/**
 * Creates a unique `Context.Tag` for a {@link ConfigFileService} parameterised
 * by `A`.
 *
 * @remarks
 * Because `Context.Tag` does not support type parameters directly, this factory
 * uses `Context.GenericTag` to produce a tag keyed by the provided `id`.
 *
 * @public
 */
export const makeConfigFileTag = <A>(id: string) =>
	Context.GenericTag<ConfigFileService<A>>(`xdg-effect/ConfigFile/${id}`);
