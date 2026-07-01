import { Option } from "effect";

/**
 * Platform-native application directories.
 *
 * @remarks
 * Absolute paths for a single namespace. On platforms without OS-level
 * separation of these concerns, `config`, `data`, and `state` typically
 * collapse to the same directory (e.g. `~/Library/Application Support/<ns>`
 * on macOS), while `cache` is distinct.
 *
 * @public
 */
export interface NativeDirs {
	readonly config: string;
	readonly data: string;
	readonly cache: string;
	readonly state: string;
}

/**
 * Resolves the OS-native application directories for a namespace.
 *
 * @remarks
 * Pure — performs no I/O and reads no environment. Callers supply `platform`
 * (from `process.platform`), `home`, and, on Windows, `appData` (`%APPDATA%`)
 * and `localAppData` (`%LOCALAPPDATA%`). Returns:
 *
 * - **darwin:** `config`/`data`/`state` under `~/Library/Application Support/<ns>`;
 *   `cache` under `~/Library/Caches/<ns>`.
 * - **win32:** `config`/`data` under `<appData>/<ns>`; `cache` under
 *   `<localAppData>/<ns>/Cache`; `state` under `<localAppData>/<ns>`. When the
 *   env vars are absent, `appData` falls back to `<home>/AppData/Roaming` and
 *   `localAppData` to `<home>/AppData/Local`.
 * - **linux / other:** `Option.none()` — on Linux, XDG is the native
 *   convention, so there is no override.
 *
 * @public
 */
export const nativeDirs = (input: {
	readonly platform: NodeJS.Platform;
	readonly home: string;
	readonly appData?: string;
	readonly localAppData?: string;
	readonly namespace: string;
}): Option.Option<NativeDirs> => {
	const { platform, home, appData, localAppData, namespace } = input;
	if (platform === "darwin") {
		const appSupport = `${home}/Library/Application Support/${namespace}`;
		return Option.some({
			config: appSupport,
			data: appSupport,
			cache: `${home}/Library/Caches/${namespace}`,
			state: appSupport,
		});
	}
	if (platform === "win32") {
		const roaming = appData ?? `${home}/AppData/Roaming`;
		const local = localAppData ?? `${home}/AppData/Local`;
		return Option.some({
			config: `${roaming}/${namespace}`,
			data: `${roaming}/${namespace}`,
			cache: `${local}/${namespace}/Cache`,
			state: `${local}/${namespace}`,
		});
	}
	return Option.none();
};
