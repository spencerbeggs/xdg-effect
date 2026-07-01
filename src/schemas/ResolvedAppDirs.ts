import { Schema } from "effect";

/**
 * The fully resolved, app-namespaced XDG directories returned by
 * {@link AppDirsService.resolveAll} and {@link AppDirsService.ensure}.
 *
 * @public
 */
export class ResolvedAppDirs extends Schema.Class<ResolvedAppDirs>("ResolvedAppDirs")({
	config: Schema.String,
	data: Schema.String,
	cache: Schema.String,
	state: Schema.String,
	runtime: Schema.OptionFromUndefinedOr(Schema.String),
}) {}
