import { FileSystem } from "@effect/platform";
import { Effect, Layer, Option } from "effect";
import { AppDirsError } from "../errors/AppDirsError.js";
import type { AppDirsConfig } from "../schemas/AppDirsConfig.js";
import { ResolvedAppDirs } from "../schemas/ResolvedAppDirs.js";
// biome-ignore lint/suspicious/noImportCycles: layer intentionally co-locates with its service tag
import { AppDirs } from "../services/AppDirs.js";
import type { NativeDirs } from "../services/NativeDirs.js";
import { nativeDirs } from "../services/NativeDirs.js";
import { XdgResolver } from "../services/XdgResolver.js";

type DirName = "config" | "data" | "cache" | "state";

/**
 * Resolves a single directory path using 5-level precedence:
 *
 * 1. Explicit override (highest priority)
 * 2. XDG env var + namespace (e.g., $XDG_CONFIG_HOME/myapp)
 * 3. Native dir (when `native: true` and the platform has a mapping,
 *    e.g., macOS `~/Library/Application Support/myapp`)
 * 4. fallbackDir (e.g., $HOME/.myapp) — all dir types share this path
 * 5. $HOME/.\<namespace\> (lowest priority)
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
	nativeValue: Option.Option<string>,
	fallbackDir: Option.Option<string>,
	override: Option.Option<string>,
	home: string,
): string =>
	Option.getOrElse(override, () =>
		Option.match(xdgValue, {
			onSome: (xdg) => `${xdg}/${namespace}`,
			onNone: () =>
				Option.getOrElse(nativeValue, () =>
					Option.match(fallbackDir, {
						onSome: (fb) => `${home}/${fb}`,
						onNone: () => `${home}/.${namespace}`,
					}),
				),
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

export const AppDirsLiveImpl = (
	config: typeof AppDirsConfig.Type,
): Layer.Layer<AppDirs, never, XdgResolver | FileSystem.FileSystem> =>
	Layer.effect(
		AppDirs,
		Effect.gen(function* () {
			const resolver = yield* XdgResolver;
			const fs = yield* FileSystem.FileSystem;

			const resolveAllDirs = Effect.gen(function* () {
				const home = yield* resolver.home;
				const [configHome, dataHome, cacheHome, stateHome, runtimeDir, appData, localAppData] = yield* Effect.all([
					resolver.configHome,
					resolver.dataHome,
					resolver.cacheHome,
					resolver.stateHome,
					resolver.runtimeDir,
					resolver.appData,
					resolver.localAppData,
				]);

				const appDataStr = Option.getOrUndefined(appData);
				const localAppDataStr = Option.getOrUndefined(localAppData);
				const nativeOpt: Option.Option<NativeDirs> = config.native
					? nativeDirs({
							platform: globalThis.process?.platform ?? "linux",
							home,
							namespace: config.namespace,
							...(appDataStr !== undefined ? { appData: appDataStr } : {}),
							...(localAppDataStr !== undefined ? { localAppData: localAppDataStr } : {}),
						})
					: Option.none();

				const configPath = resolveDir(
					"config",
					configHome,
					config.namespace,
					Option.map(nativeOpt, (n) => n.config),
					config.fallbackDir,
					getDirOverride(config.dirs, "config"),
					home,
				);
				const dataPath = resolveDir(
					"data",
					dataHome,
					config.namespace,
					Option.map(nativeOpt, (n) => n.data),
					config.fallbackDir,
					getDirOverride(config.dirs, "data"),
					home,
				);
				const cachePath = resolveDir(
					"cache",
					cacheHome,
					config.namespace,
					Option.map(nativeOpt, (n) => n.cache),
					config.fallbackDir,
					getDirOverride(config.dirs, "cache"),
					home,
				);
				const statePath = resolveDir(
					"state",
					stateHome,
					config.namespace,
					Option.map(nativeOpt, (n) => n.state),
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

			const ensureSingleDir = (dirName: DirName) =>
				Effect.gen(function* () {
					const dir = yield* resolveSingleDir(dirName);
					yield* fs
						.makeDirectory(dir, { recursive: true })
						.pipe(Effect.catchAll((e) => Effect.fail(new AppDirsError({ directory: dirName, reason: String(e) }))));
					return dir;
				});

			return AppDirs.of({
				config: resolveSingleDir("config"),
				data: resolveSingleDir("data"),
				cache: resolveSingleDir("cache"),
				state: resolveSingleDir("state"),
				runtime: Effect.map(resolveAllDirs, (resolved) => resolved.runtime),
				ensureConfig: ensureSingleDir("config"),
				ensureData: ensureSingleDir("data"),
				ensureCache: ensureSingleDir("cache"),
				ensureState: ensureSingleDir("state"),
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
