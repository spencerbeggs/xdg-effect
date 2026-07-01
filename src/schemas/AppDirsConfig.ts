import { Option, Schema } from "effect";

/**
 * Configuration for {@link AppDirs.Live}: the app namespace, optional
 * per-directory overrides, and whether to use native OS conventions.
 *
 * @public
 */
export class AppDirsConfig extends Schema.Class<AppDirsConfig>("AppDirsConfig")({
	namespace: Schema.String,
	fallbackDir: Schema.optionalWith(Schema.OptionFromUndefinedOr(Schema.String), {
		default: () => Option.none(),
	}),
	dirs: Schema.optionalWith(
		Schema.OptionFromUndefinedOr(
			Schema.Struct({
				config: Schema.OptionFromUndefinedOr(Schema.String),
				data: Schema.OptionFromUndefinedOr(Schema.String),
				cache: Schema.OptionFromUndefinedOr(Schema.String),
				state: Schema.OptionFromUndefinedOr(Schema.String),
				runtime: Schema.OptionFromUndefinedOr(Schema.String),
			}),
		),
		{ default: () => Option.none() },
	),
	native: Schema.optionalWith(Schema.Boolean, { default: () => false }),
}) {}
