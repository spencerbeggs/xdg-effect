import { Schema } from "effect";

export class AppDirsConfig extends Schema.Class<AppDirsConfig>("AppDirsConfig")({
	namespace: Schema.String,
	fallbackDir: Schema.OptionFromUndefinedOr(Schema.String),
	dirs: Schema.OptionFromUndefinedOr(
		Schema.Struct({
			config: Schema.OptionFromUndefinedOr(Schema.String),
			data: Schema.OptionFromUndefinedOr(Schema.String),
			cache: Schema.OptionFromUndefinedOr(Schema.String),
			state: Schema.OptionFromUndefinedOr(Schema.String),
			runtime: Schema.OptionFromUndefinedOr(Schema.String),
		}),
	),
}) {}
