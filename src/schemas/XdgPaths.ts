import { Schema } from "effect";

/**
 * The full set of resolved XDG Base Directory paths, returned by
 * {@link XdgResolverService.resolveAll}.
 *
 * @public
 */
export class XdgPaths extends Schema.Class<XdgPaths>("XdgPaths")({
	home: Schema.String,
	configHome: Schema.OptionFromUndefinedOr(Schema.String),
	dataHome: Schema.OptionFromUndefinedOr(Schema.String),
	cacheHome: Schema.OptionFromUndefinedOr(Schema.String),
	stateHome: Schema.OptionFromUndefinedOr(Schema.String),
	runtimeDir: Schema.OptionFromUndefinedOr(Schema.String),
	appData: Schema.OptionFromUndefinedOr(Schema.String),
	localAppData: Schema.OptionFromUndefinedOr(Schema.String),
}) {}
