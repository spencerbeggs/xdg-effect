import { Schema } from "effect";

export class ResolvedAppDirs extends Schema.Class<ResolvedAppDirs>("ResolvedAppDirs")({
	config: Schema.String,
	data: Schema.String,
	cache: Schema.String,
	state: Schema.String,
	runtime: Schema.OptionFromUndefinedOr(Schema.String),
}) {}
