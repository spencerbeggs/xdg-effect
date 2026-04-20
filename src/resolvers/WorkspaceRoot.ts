import { FileSystem } from "@effect/platform";
import { Effect, Option } from "effect";
import type { ConfigResolver } from "./ConfigResolver.js";

/**
 * Resolver that finds the workspace root and looks for a file there.
 *
 * @remarks
 * Walks up from `cwd` looking for a monorepo workspace root (indicated by
 * `pnpm-workspace.yaml` or a `package.json` with a `workspaces` field). When
 * found, checks whether `filename` exists at the root (optionally under
 * `subpath`). Returns `Option.some(fullPath)` when found, `Option.none()`
 * otherwise. Filesystem errors are caught and treated as "not found".
 *
 * @public
 */
export const WorkspaceRoot = (options: {
	readonly filename: string;
	readonly subpath?: string;
	readonly cwd?: string;
}): ConfigResolver<FileSystem.FileSystem> => ({
	name: "workspace",
	resolve: Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		let current = options.cwd ?? globalThis.process?.cwd?.() ?? "/";

		let workspaceRoot: string | undefined;
		while (true) {
			const pnpmWs = `${current}/pnpm-workspace.yaml`;
			if (yield* fs.exists(pnpmWs)) {
				workspaceRoot = current;
				break;
			}
			const pkgPath = `${current}/package.json`;
			if (yield* fs.exists(pkgPath)) {
				const content = yield* fs.readFileString(pkgPath);
				try {
					const pkg = JSON.parse(content) as Record<string, unknown>;
					if ("workspaces" in pkg) {
						workspaceRoot = current;
						break;
					}
				} catch {
					// Not valid JSON, skip
				}
			}
			const parent = current.replace(/\/[^/]+$/, "") || "/";
			if (parent === current) break;
			current = parent;
		}

		if (!workspaceRoot) return Option.none();

		const subpath = options.subpath ? `/${options.subpath}` : "";
		const fullPath = `${workspaceRoot}${subpath}/${options.filename}`;
		const exists = yield* fs.exists(fullPath);
		return exists ? Option.some(fullPath) : Option.none();
	}).pipe(Effect.catchAll(() => Effect.succeed(Option.none()))),
});
