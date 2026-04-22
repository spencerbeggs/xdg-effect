import type { ParseResult } from "effect";
import { Effect, Schema } from "effect";
import type { SchemaEntry } from "../services/JsonSchemaExporter.js";

/**
 * Static members added by {@link JsonSchemaClass} to the returned class constructor.
 */
export interface JsonSchemaClassStatics<Self> {
	/** The JSON Schema `$id` URL for this schema class. */
	readonly $id: string;
	/** A ready-to-use {@link SchemaEntry} for `JsonSchemaExporter.generate()`. */
	readonly schemaEntry: SchemaEntry;
	/** Encode an instance to a plain object with `$schema` key injected. */
	readonly toJson: (instance: Self) => Effect.Effect<Record<string, unknown>, ParseResult.ParseError>;
	/** Decode unknown input into a validated instance. */
	readonly validate: (input: unknown) => Effect.Effect<Self, ParseResult.ParseError>;
}

/**
 * A {@link Schema.Class} wrapper that bundles JSON Schema identity (`$id`,
 * `$schema`) with the schema definition.
 *
 * Static members: `$id`, `schemaEntry` (for the exporter), `toJson` (encodes
 * with `$schema` key), `validate` (Effect Schema decode). Supports `extend()`
 * for adding fields to the schema.
 *
 * **Note on `extend()`:** Extended classes inherit instance fields and
 * `schema`/`toJson`/`validate` correctly (they use `this` at access time),
 * but `schemaEntry.name`, `schemaEntry.$id`, and the static `$id` reflect
 * the **base class** identity. If you need a distinct `$id` for the extended
 * class, create a new `JsonSchemaClass` instead of extending.
 *
 * @example
 * ```ts
 * class AppConfig extends JsonSchemaClass<AppConfig>("AppConfig", {
 *   $id: "https://json.schemastore.org/app-config.json",
 * })({
 *   name: Schema.String,
 *   port: Schema.Number,
 * }) {}
 *
 * AppConfig.$id;           // "https://json.schemastore.org/app-config.json"
 * AppConfig.schemaEntry;   // { name, schema, rootDefName, $id }
 * AppConfig.toJson(inst);  // Effect with { $schema, name, port }
 * AppConfig.validate(raw); // Effect<AppConfig, ParseError>
 * ```
 */
export const JsonSchemaClass = <Self = never>(
	name: string,
	options: { readonly $id: string },
): (<Fields extends Schema.Struct.Fields>(
	fields: Fields,
) => [Self] extends [never]
	? "Missing `Self` generic - use `class Self extends JsonSchemaClass<Self>(...)({ ... })`"
	: Schema.Class<
			Self,
			Fields,
			Schema.Struct.Encoded<Fields>,
			Schema.Struct.Context<Fields>,
			Schema.Struct.Constructor<Fields>,
			// biome-ignore lint/complexity/noBannedTypes: matches Schema.Class Inherited type parameter
			{},
			// biome-ignore lint/complexity/noBannedTypes: matches Schema.Class Proto type parameter
			{}
		> &
			JsonSchemaClassStatics<Self>) => {
	return ((fields: Schema.Struct.Fields) => {
		// biome-ignore lint/suspicious/noExplicitAny: Schema.Class self-type guard resolves at the call site; cast is safe because the outer signature enforces Self
		const BaseClass = (Schema.Class as any)(name)(fields);

		Object.defineProperty(BaseClass, "$id", {
			value: options.$id,
			enumerable: true,
			writable: false,
			configurable: false,
		});

		Object.defineProperty(BaseClass, "schemaEntry", {
			get() {
				return {
					name,
					// biome-ignore lint/suspicious/noExplicitAny: Schema type params are invariant — any is required to accept all schemas
					schema: this as Schema.Schema<any, any, never>,
					rootDefName: name,
					$id: options.$id,
				} satisfies SchemaEntry;
			},
			enumerable: true,
			configurable: false,
		});

		Object.defineProperty(BaseClass, "toJson", {
			get() {
				// biome-ignore lint/suspicious/noExplicitAny: getter captures the subclass at access time; cast to Schema is safe
				const self = this as Schema.Schema<any, Record<string, unknown>, never>;
				return (instance: Self) =>
					Effect.map(Schema.encode(self)(instance), (encoded) => ({
						$schema: options.$id,
						...encoded,
					}));
			},
			enumerable: true,
			configurable: false,
		});

		Object.defineProperty(BaseClass, "validate", {
			get() {
				// biome-ignore lint/suspicious/noExplicitAny: getter captures the subclass at access time; cast to Schema is safe
				const self = this as Schema.Schema<any, unknown, never>;
				return (input: unknown) => Schema.decodeUnknown(self)(input);
			},
			enumerable: true,
			configurable: false,
		});

		return BaseClass;
		// biome-ignore lint/suspicious/noExplicitAny: outer generic signature provides full type safety; inner implementation is untyped
	}) as any;
};
