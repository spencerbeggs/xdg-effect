import { FileSystem } from "@effect/platform";
import { Effect, Layer, Option } from "effect";
import { AppDirsError } from "../errors/AppDirsError.js";
import type { AppDirsConfig } from "../schemas/AppDirsConfig.js";
import { ResolvedAppDirs } from "../schemas/ResolvedAppDirs.js";
import { AppDirs } from "../services/AppDirs.js";
import { XdgResolver } from "../services/XdgResolver.js";

type DirName = "config" | "data" | "cache" | "state";

/**
 * Resolves a single directory path using 4-level precedence:
 *
 * 1. Explicit override (highest priority)
 * 2. XDG env var + namespace (e.g., $XDG_CONFIG_HOME/myapp)
 * 3. fallbackDir (e.g., $HOME/.myapp) — all dir types share this path
 * 4. $HOME/.\<namespace\> (lowest priority)
 *
 * Note: Unlike the XDG spec, this does NOT use per-type defaults
 * (~/.config, ~/.local/share, etc.) when XDG vars are unset.
 * Instead, all dir types collapse to a single dot-directory.
 * Use explicit `dirs` overrides for XDG-spec-compliant paths.
 */
const resolveDir = (
	_dirName: DirName,
	xdgValue: Option.Option<string>,
	namespace: string,
	fallbackDir: Option.Option<string>,
	override: Option.Option<string>,
	home: string,
): string =>
	Option.getOrElse(override, () =>
		Option.match(xdgValue, {
			onSome: (xdg) => `${xdg}/${namespace}`,
			onNone: () =>
				Option.match(fallbackDir, {
					onSome: (fb) => `${home}/${fb}`,
					onNone: () => `${home}/.${namespace}`,
				}),
		}),
	);

const getDirOverride = (
	dirs: Option.Option<{
		config: Option.Option<string>;
		data: Option.Option<string>;
		cache: Option.Option<string>;
		state: Option.Option<string>;
		runtime: Option.Option<string>;
	}>,
	dirName: DirName | "runtime",
): Option.Option<string> => Option.flatMap(dirs, (d) => d[dirName]);

export const AppDirsLive = (
	config: typeof AppDirsConfig.Type,
): Layer.Layer<AppDirs, never, XdgResolver | FileSystem.FileSystem> =>
	Layer.effect(
		AppDirs,
		Effect.gen(function* () {
			const resolver = yield* XdgResolver;
			const fs = yield* FileSystem.FileSystem;

			const resolveAllDirs = Effect.gen(function* () {
				const home = yield* resolver.home;
				const [configHome, dataHome, cacheHome, stateHome, runtimeDir] = yield* Effect.all([
					resolver.configHome,
					resolver.dataHome,
					resolver.cacheHome,
					resolver.stateHome,
					resolver.runtimeDir,
				]);

				const configPath = resolveDir(
					"config",
					configHome,
					config.namespace,
					config.fallbackDir,
					getDirOverride(config.dirs, "config"),
					home,
				);
				const dataPath = resolveDir(
					"data",
					dataHome,
					config.namespace,
					config.fallbackDir,
					getDirOverride(config.dirs, "data"),
					home,
				);
				const cachePath = resolveDir(
					"cache",
					cacheHome,
					config.namespace,
					config.fallbackDir,
					getDirOverride(config.dirs, "cache"),
					home,
				);
				const statePath = resolveDir(
					"state",
					stateHome,
					config.namespace,
					config.fallbackDir,
					getDirOverride(config.dirs, "state"),
					home,
				);
				const runtimePath = Option.orElse(getDirOverride(config.dirs, "runtime"), () =>
					Option.map(runtimeDir, (rd) => `${rd}/${config.namespace}`),
				);

				return new ResolvedAppDirs({
					config: configPath,
					data: dataPath,
					cache: cachePath,
					state: statePath,
					runtime: runtimePath,
				});
			}).pipe(
				Effect.mapError(
					(e) =>
						new AppDirsError({
							directory: "all",
							reason: String(e),
						}),
				),
			);

			const resolveSingleDir = (dirName: DirName) => Effect.map(resolveAllDirs, (resolved) => resolved[dirName]);

			return AppDirs.of({
				config: resolveSingleDir("config"),
				data: resolveSingleDir("data"),
				cache: resolveSingleDir("cache"),
				state: resolveSingleDir("state"),
				runtime: Effect.map(resolveAllDirs, (resolved) => resolved.runtime),
				resolveAll: resolveAllDirs,
				ensure: Effect.gen(function* () {
					const resolved = yield* resolveAllDirs;
					const ensureDir = (dir: string, name: string) =>
						fs
							.makeDirectory(dir, { recursive: true })
							.pipe(Effect.catchAll((e) => Effect.fail(new AppDirsError({ directory: name, reason: String(e) }))));
					yield* ensureDir(resolved.config, "config");
					yield* ensureDir(resolved.data, "data");
					yield* ensureDir(resolved.cache, "cache");
					yield* ensureDir(resolved.state, "state");
					if (Option.isSome(resolved.runtime)) {
						yield* ensureDir(resolved.runtime.value, "runtime");
					}
					return resolved;
				}),
			});
		}),
	);
