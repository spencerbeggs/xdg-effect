import { Data } from "effect";

/**
 * Tagged error base for {@link CacheError}.
 *
 * @remarks
 * Exported because TypeScript declaration bundling requires the base class to be
 * accessible wherever `CacheError` appears in a public type signature; it carries
 * no fields of its own. Prefer constructing and catching {@link CacheError} directly.
 *
 * @public
 */
export const CacheErrorBase = Data.TaggedError("CacheError");

/**
 * Raised when a SQLite-backed cache operation fails.
 *
 * @remarks
 * The `operation` field indicates which cache operation triggered the failure
 * (e.g. `"get"`, `"set"`, `"delete"`), `key` is the optional cache key
 * involved, and `reason` describes the underlying cause.
 * Use `Effect.catchTag` with the `"CacheError"` tag to handle this error
 * selectively.
 *
 * @public
 */
export class CacheError extends CacheErrorBase<{
	readonly operation: string;
	readonly key?: string;
	readonly reason: string;
}> {
	get message(): string {
		const keyPart = this.key ? ` for key "${this.key}"` : "";
		return `Cache ${this.operation} failed${keyPart}: ${this.reason}`;
	}
}
