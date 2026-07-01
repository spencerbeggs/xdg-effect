import { Data } from "effect";

/**
 * Tagged error base for {@link AppDirsError}.
 *
 * @remarks
 * Exported because TypeScript declaration bundling requires the base class to be
 * accessible wherever `AppDirsError` appears in a public type signature; it carries
 * no fields of its own. Prefer constructing and catching {@link AppDirsError} directly.
 *
 * @public
 */
export const AppDirsErrorBase = Data.TaggedError("AppDirsError");

/**
 * Raised when application directory resolution fails.
 *
 * @remarks
 * The `directory` field identifies which XDG directory was being resolved
 * (e.g. `"config"`, `"data"`, `"cache"`) and `reason` describes the
 * underlying cause. Use `Effect.catchTag` with the `"AppDirsError"` tag to
 * handle this error selectively.
 *
 * @public
 */
export class AppDirsError extends AppDirsErrorBase<{
	readonly directory: string;
	readonly reason: string;
}> {
	get message(): string {
		return `AppDirs error for "${this.directory}": ${this.reason}`;
	}
}
