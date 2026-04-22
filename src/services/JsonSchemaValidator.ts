import type { Effect } from "effect";
import { Context } from "effect";
import type { JsonSchemaValidationError } from "../errors/JsonSchemaValidationError.js";
// biome-ignore lint/suspicious/noImportCycles: service class intentionally co-locates its Live layer
import { JsonSchemaValidatorLiveImpl } from "../layers/JsonSchemaValidatorLive.js";
import type { JsonSchemaOutput } from "./JsonSchemaExporter.js";

export interface ValidatorOptions {
	readonly strict?: boolean;
}

export interface JsonSchemaValidatorService {
	readonly validate: (
		output: JsonSchemaOutput,
		options?: ValidatorOptions,
	) => Effect.Effect<JsonSchemaOutput, JsonSchemaValidationError>;
	readonly validateMany: (
		outputs: ReadonlyArray<JsonSchemaOutput>,
		options?: ValidatorOptions,
	) => Effect.Effect<ReadonlyArray<JsonSchemaOutput>, JsonSchemaValidationError>;
}

export class JsonSchemaValidator extends Context.Tag("xdg-effect/JsonSchemaValidator")<
	JsonSchemaValidator,
	JsonSchemaValidatorService
>() {
	static get Live() {
		return JsonSchemaValidatorLiveImpl();
	}
	static get Test() {
		return JsonSchemaValidatorLiveImpl();
	}
}
