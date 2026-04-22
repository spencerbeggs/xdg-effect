import { Data } from "effect";

/**
 * Tagged error base for {@link JsonSchemaValidationError}.
 *
 * @privateRemarks
 * Exported because TypeScript declaration bundling requires the base class to be
 * accessible when `JsonSchemaValidationError` appears in public type signatures.
 * Consumers should use {@link JsonSchemaValidationError} directly.
 *
 * @internal
 */
export const JsonSchemaValidationErrorBase = Data.TaggedError("JsonSchemaValidationError");

/**
 * Raised when JSON Schema validation fails.
 *
 * @remarks
 * The `name` field identifies which schema failed, and `errors` contains
 * human-readable descriptions of each validation issue. Use `Effect.catchTag`
 * with the `"JsonSchemaValidationError"` tag to handle selectively.
 *
 * @public
 */
export class JsonSchemaValidationError extends JsonSchemaValidationErrorBase<{
	readonly name: string;
	readonly errors: ReadonlyArray<string>;
}> {
	get message(): string {
		return `JSON Schema validation failed for "${this.name}": ${this.errors.join("; ")}`;
	}
}
