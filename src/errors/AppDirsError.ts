import { Data } from "effect";

/**
 * Tagged error base for {@link AppDirsError}.
 *
 * @privateRemarks
 * Exported because TypeScript declaration bundling requires the base class to be
 * accessible when `AppDirsError` appears in public type signatures.
 * Consumers should use {@link AppDirsError} directly.
 *
 * @internal
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
