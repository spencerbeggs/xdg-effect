import { Schema } from "effect";

export class XdgPaths extends Schema.Class<XdgPaths>("XdgPaths")({
	home: Schema.String,
	configHome: Schema.OptionFromUndefinedOr(Schema.String),
	dataHome: Schema.OptionFromUndefinedOr(Schema.String),
	cacheHome: Schema.OptionFromUndefinedOr(Schema.String),
	stateHome: Schema.OptionFromUndefinedOr(Schema.String),
	runtimeDir: Schema.OptionFromUndefinedOr(Schema.String),
}) {}
