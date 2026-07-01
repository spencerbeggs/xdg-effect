import { Data } from "effect";

/**
 * Tagged error base for {@link XdgError}.
 *
 * @remarks
 * Exported because TypeScript declaration bundling requires the base class to be
 * accessible wherever `XdgError` appears in a public type signature; it carries
 * no fields of its own. Prefer constructing and catching {@link XdgError} directly.
 *
 * @public
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
