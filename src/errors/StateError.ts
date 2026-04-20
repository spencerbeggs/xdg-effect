import { Data } from "effect";

/**
 * Tagged error base for {@link StateError}.
 *
 * @privateRemarks
 * Exported because TypeScript declaration bundling requires the base class to be
 * accessible when `StateError` appears in public type signatures.
 * Consumers should use {@link StateError} directly.
 *
 * @internal
 */
export const StateErrorBase = Data.TaggedError("StateError");

/**
 * Raised when a SQLite-backed state operation fails.
 *
 * @remarks
 * The `operation` field indicates which state operation triggered the failure
 * (e.g. `"migrate"`, `"read"`, `"write"`) and `reason` describes the
 * underlying cause. Use `Effect.catchTag` with the `"StateError"` tag to
 * handle this error selectively.
 *
 * @public
 */
export class StateError extends StateErrorBase<{
	readonly operation: string;
	readonly reason: string;
}> {
	get message(): string {
		return `State ${this.operation} failed: ${this.reason}`;
	}
}
