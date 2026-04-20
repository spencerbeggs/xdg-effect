import { Data } from "effect";

/**
 * Tagged error base for {@link XdgError}.
 *
 * @privateRemarks
 * Exported because TypeScript declaration bundling requires the base class to be
 * accessible when `XdgError` appears in public type signatures.
 * Consumers should use {@link XdgError} directly.
 *
 * @internal
 */
export const XdgErrorBase = Data.TaggedError("XdgError");

/**
 * Raised when an XDG Base Directory environment variable is missing or invalid.
 *
 * @remarks
 * This is the most fundamental error in the library, indicating that the
 * environment cannot satisfy XDG directory requirements (e.g. `HOME` is not
 * set). Use `Effect.catchTag` with the `"XdgError"` tag to handle this error
 * selectively.
 *
 * @public
 */
export class XdgError extends XdgErrorBase<{
	readonly message: string;
}> {}
