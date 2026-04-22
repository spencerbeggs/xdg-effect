import { Schema, SchemaAST } from "effect";

/**
 * Schema for any JSON-serializable value.
 *
 * @remarks
 * Drop-in replacement for `Schema.Unknown` in definitions meant for JSON
 * Schema generation. `Schema.Unknown` produces `$id: "/schemas/unknown"`
 * artifacts that fail Ajv strict-mode validation. `Jsonifiable` emits an
 * empty schema (`{}`), which in JSON Schema means "accepts any valid instance."
 *
 * The `jsonSchema` annotation uses `{ type: undefined, $schema: undefined }` to
 * trigger Effect's override path in JSON Schema generation, which returns the
 * handler directly (bypassing the constUnknown constants) while keeping all
 * annotation values undefined so they are omitted from serialized output.
 *
 * @public
 */
export const Jsonifiable = Schema.Unknown.annotations({
	[SchemaAST.JSONSchemaAnnotationId]: { type: undefined, $schema: undefined },
});
