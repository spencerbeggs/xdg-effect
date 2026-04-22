import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { JsonSchemaValidationError } from "../src/errors/JsonSchemaValidationError.js";
import type { JsonSchemaOutput } from "../src/services/JsonSchemaExporter.js";
import { JsonSchemaValidator } from "../src/services/JsonSchemaValidator.js";

const run = <A, E>(effect: Effect.Effect<A, E, JsonSchemaValidator>) =>
	Effect.runPromise(Effect.provide(effect, JsonSchemaValidator.Live));

const validSchema: JsonSchemaOutput = {
	name: "ValidSchema",
	schema: {
		$schema: "http://json-schema.org/draft-07/schema#",
		type: "object",
		properties: {
			name: { type: "string" },
			port: { type: "number" },
		},
		required: ["name", "port"],
		additionalProperties: false,
	},
};

const invalidSchema: JsonSchemaOutput = {
	name: "InvalidSchema",
	schema: {
		$schema: "http://json-schema.org/draft-07/schema#",
		type: "invalid-type",
	},
};

describe("JsonSchemaValidator", () => {
	it("validates a correct schema in non-strict mode", async () => {
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(validSchema);
			}),
		);
		expect(result.name).toBe("ValidSchema");
		expect(result.schema).toEqual(validSchema.schema);
	});

	it("rejects an invalid schema", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(invalidSchema).pipe(Effect.flip);
				}),
				JsonSchemaValidator.Live,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.name).toBe("InvalidSchema");
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it("validates a correct schema in strict mode", async () => {
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(validSchema, { strict: true });
			}),
		);
		expect(result.name).toBe("ValidSchema");
	});

	it("flags missing additionalProperties in strict mode", async () => {
		const schemaWithoutAdditionalProps: JsonSchemaOutput = {
			name: "MissingAdditionalProps",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					name: { type: "string" },
				},
				required: ["name"],
			},
		};
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schemaWithoutAdditionalProps, { strict: true }).pipe(Effect.flip);
				}),
				JsonSchemaValidator.Live,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("additionalProperties"))).toBe(true);
	});

	it("validates many schemas at once", async () => {
		const results = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validateMany([validSchema, validSchema]);
			}),
		);
		expect(results).toHaveLength(2);
	});

	it("Test layer is identical to Live", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(validSchema);
				}),
				JsonSchemaValidator.Test,
			),
		);
		expect(result.name).toBe("ValidSchema");
	});
});
