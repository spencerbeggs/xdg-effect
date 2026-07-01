import type { FileSystem } from "@effect/platform";
import type {
	ConfigCodec,
	ConfigError,
	ConfigFileOptions,
	ConfigFileService,
	ConfigResolver,
} from "config-file-effect";
import { ConfigFile, FirstMatch, JsonCodec, SystemEtc, TomlCodec, UpwardWalk } from "config-file-effect";
import type { Context, Effect, Schema } from "effect";
import { Layer } from "effect";
import { NativeConfigResolver } from "../resolvers/NativeConfigResolver.js";
import { XdgConfigResolver } from "../resolvers/XdgConfigResolver.js";
import { XdgSavePath } from "../resolvers/XdgSavePath.js";
import { AppDirsConfig } from "../schemas/AppDirsConfig.js";
import type { AppDirs } from "../services/AppDirs.js";
import type { XdgResolver } from "../services/XdgResolver.js";
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
 * Options for {@link XdgConfigLive.multi}.
 *
 * @remarks
 * Accepts an array of config specs that share a single {@link AppDirsConfig}.
 * Each config spec produces an independent `ConfigFileService` layer,
 * all composed under one shared `XdgLive` layer.
 *
 * @public
 */
export interface XdgConfigMultiOptions {
	readonly app: typeof AppDirsConfig.Type;
	// biome-ignore lint/suspicious/noExplicitAny: generic is erased across heterogeneous config specs
	readonly configs: ReadonlyArray<ConfigFileOptions<any>>;
}

/**
 * Preset options for {@link XdgConfigLive.toml} and {@link XdgConfigLive.json}.
 *
 * @remarks
 * Reduces the full {@link XdgConfigLiveOptions} to 4 required concepts:
 * `namespace`, `filename`, `tag`, and `schema`. The preset hardcodes
 * `UpwardWalk` + `XdgConfigResolver` as resolvers,
 * `FirstMatch` as the strategy, and `XdgSavePath` as the
 * default save path.
 *
 * @public
 */
export interface XdgConfigPresetOptions<A> {
	readonly namespace: string;
	readonly filename: string;
	readonly tag: Context.Tag<ConfigFileService<A>, ConfigFileService<A>>;
	// biome-ignore lint/suspicious/noExplicitAny: Encoded type varies per schema; `any` allows all Schema.Struct shapes
	readonly schema: Schema.Schema<A, any>;
	// biome-ignore lint/suspicious/noExplicitAny: resolvers may carry heterogeneous requirements
	readonly extraResolvers?: ReadonlyArray<ConfigResolver<any>>;
	readonly validate?: (value: A) => Effect.Effect<A, ConfigError>;
}

/**
 * Builds full {@link XdgConfigLiveOptions} from a preset and a codec.
 *
 * @internal
 */
const makePreset = <A>(options: XdgConfigPresetOptions<A>, codec: ConfigCodec): XdgConfigLiveOptions<A> => ({
	app: new AppDirsConfig({ namespace: options.namespace }),
	config: {
		tag: options.tag,
		schema: options.schema,
		codec,
		strategy: FirstMatch,
		resolvers: [
			...(options.extraResolvers ?? []),
			UpwardWalk({ filename: options.filename }),
			XdgConfigResolver({ filename: options.filename }),
		],
		defaultPath: XdgSavePath(options.filename),
		...(options.validate != null ? { validate: options.validate } : {}),
	},
});

/**
 * Options for {@link XdgConfigLive.layered}.
 *
 * @remarks
 * Wires the full project→user→system search chain: an `UpwardWalk` with
 * `projectSubpaths` (dot-config convention), `XdgConfigResolver`, an
 * optional `NativeConfigResolver` (native user config), and an optional
 * `SystemEtc` (`/etc/<ns>`). Unlike the `.toml`/`.json` presets, the codec is
 * explicit.
 *
 * @public
 */
export interface XdgConfigLayeredOptions<A> {
	readonly namespace: string;
	readonly filename: string;
	readonly tag: Context.Tag<ConfigFileService<A>, ConfigFileService<A>>;
	// biome-ignore lint/suspicious/noExplicitAny: Encoded type varies per schema; `any` allows all Schema.Struct shapes
	readonly schema: Schema.Schema<A, any>;
	readonly codec: ConfigCodec;
	readonly projectSubpaths?: ReadonlyArray<string>;
	readonly native?: boolean;
	readonly system?: boolean;
	// biome-ignore lint/suspicious/noExplicitAny: resolvers may carry heterogeneous requirements
	readonly extraResolvers?: ReadonlyArray<ConfigResolver<any>>;
	readonly validate?: (value: A) => Effect.Effect<A, ConfigError>;
}

/**
 * Builds full {@link XdgConfigLiveOptions} from layered options.
 *
 * @internal
 */
const makeLayeredPreset = <A>(options: XdgConfigLayeredOptions<A>): XdgConfigLiveOptions<A> => ({
	app: new AppDirsConfig({ namespace: options.namespace }),
	config: {
		tag: options.tag,
		schema: options.schema,
		codec: options.codec,
		strategy: FirstMatch,
		resolvers: [
			...(options.extraResolvers ?? []),
			UpwardWalk({ filename: options.filename, subpaths: options.projectSubpaths ?? [".", ".config"] }),
			XdgConfigResolver({ filename: options.filename }),
			...(options.native !== false
				? [NativeConfigResolver({ namespace: options.namespace, filename: options.filename })]
				: []),
			...(options.system !== false ? [SystemEtc({ app: options.namespace, filename: options.filename })] : []),
		],
		defaultPath: XdgSavePath(options.filename),
		...(options.validate != null ? { validate: options.validate } : {}),
	},
});

/**
 * Implementation backing the exported {@link XdgConfigLive} callable.
 *
 * @internal
 */
const _xdgConfigLive = <A>(
	options: XdgConfigLiveOptions<A>,
): Layer.Layer<XdgResolver | AppDirs | ConfigFileService<A>, never, FileSystem.FileSystem> =>
	Layer.mergeAll(XdgLive(options.app), ConfigFile.Live(options.config));

/**
 * Aggregate layer providing {@link XdgResolver}, {@link AppDirs}, and a
 * `ConfigFileService`.
 *
 * @remarks
 * Composes `XdgLive` (which provides XdgResolver + AppDirs) with
 * `ConfigFile.Live` for config file support. Requires `FileSystem`
 * from `@effect/platform`.
 *
 * Use the full form for complete control, or the `.toml()` / `.json()`
 * presets for the common case:
 *
 * ```typescript
 * // Full form
 * XdgConfigLive({ app, config: { tag, schema, codec, strategy, resolvers } });
 *
 * // Preset form (4 required options)
 * XdgConfigLive.toml({ namespace, filename, tag, schema });
 * XdgConfigLive.json({ namespace, filename, tag, schema });
 * ```
 *
 * @public
 */
export const XdgConfigLive = Object.assign(_xdgConfigLive, {
	/**
	 * Preset factory for TOML config files.
	 *
	 * @remarks
	 * Hardcodes `TomlCodec`, `FirstMatch` strategy,
	 * `UpwardWalk` + `XdgConfigResolver` resolvers, and
	 * `XdgSavePath` for the default save path.
	 *
	 * @public
	 */
	toml: <A>(
		options: XdgConfigPresetOptions<A>,
	): Layer.Layer<XdgResolver | AppDirs | ConfigFileService<A>, never, FileSystem.FileSystem> =>
		_xdgConfigLive(makePreset(options, TomlCodec)),
	/**
	 * Preset factory for JSON config files.
	 *
	 * @remarks
	 * Hardcodes `JsonCodec`, `FirstMatch` strategy,
	 * `UpwardWalk` + `XdgConfigResolver` resolvers, and
	 * `XdgSavePath` for the default save path.
	 *
	 * @public
	 */
	json: <A>(
		options: XdgConfigPresetOptions<A>,
	): Layer.Layer<XdgResolver | AppDirs | ConfigFileService<A>, never, FileSystem.FileSystem> =>
		_xdgConfigLive(makePreset(options, JsonCodec)),
	/**
	 * Multi-config factory for applications with multiple config files.
	 *
	 * @remarks
	 * Creates a single shared `XdgLive` layer (providing {@link XdgResolver}
	 * and {@link AppDirs}) and merges it with a `ConfigFile.Live` layer for
	 * each config spec. Eliminates manual `Layer.provide` wiring when an
	 * application needs more than one config file (e.g., main config +
	 * credentials).
	 *
	 * ```typescript
	 * const layer = XdgConfigLive.multi({
	 *   app: new AppDirsConfig({ namespace: "my-tool" }),
	 *   configs: [mainConfigSpec, credentialsSpec],
	 * });
	 * ```
	 *
	 * @public
	 */
	multi: (
		options: XdgConfigMultiOptions,
		// biome-ignore lint/suspicious/noExplicitAny: generic is erased across heterogeneous config specs
	): Layer.Layer<XdgResolver | AppDirs | ConfigFileService<any>, never, FileSystem.FileSystem> => {
		const xdg = XdgLive(options.app);
		const configLayers = options.configs.map((c) => ConfigFile.Live(c));
		return Layer.mergeAll(xdg, ...configLayers);
	},
	/**
	 * Preset factory for the full project→user→system search chain.
	 *
	 * @remarks
	 * Wires `UpwardWalk` (with `projectSubpaths`, default `[".", ".config"]`),
	 * `XdgConfigResolver`, `NativeConfigResolver` (when `native`
	 * is not `false`), and `SystemEtc` (when `system` is not `false`), under
	 * `FirstMatch`, with an explicit `codec`.
	 *
	 * @public
	 */
	layered: <A>(
		options: XdgConfigLayeredOptions<A>,
	): Layer.Layer<XdgResolver | AppDirs | ConfigFileService<A>, never, FileSystem.FileSystem> =>
		_xdgConfigLive(makeLayeredPreset(options)),
});
