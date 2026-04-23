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

	it("accepts x-taplo annotations in strict mode", async () => {
		const schemaWithTaplo: JsonSchemaOutput = {
			name: "TaploSchema",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					name: { type: "string" },
				},
				required: ["name"],
				additionalProperties: false,
				"x-taplo": {
					initKeys: ["name"],
					docs: { main: "A config file" },
				},
			},
		};
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schemaWithTaplo, { strict: true });
			}),
		);
		expect(result.name).toBe("TaploSchema");
	});

	it("accepts combined x-tombi-* and x-taplo annotations in strict mode", async () => {
		const schemaWithBoth: JsonSchemaOutput = {
			name: "CombinedSchema",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					name: { type: "string" },
					port: { type: "number" },
				},
				required: ["name", "port"],
				additionalProperties: false,
				"x-tombi-toml-version": "v1.0.0",
				"x-tombi-table-keys-order": "schema",
				"x-taplo": {
					initKeys: ["name", "port"],
				},
			},
		};
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schemaWithBoth, { strict: true });
			}),
		);
		expect(result.name).toBe("CombinedSchema");
		expect(result.schema["x-taplo"]).toEqual({ initKeys: ["name", "port"] });
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

describe("annotation placement", () => {
	// ── Root-only keywords ──────────────────────────────────────────────────

	it("accepts x-tombi-toml-version at root", async () => {
		const schema: JsonSchemaOutput = {
			name: "RootTomlVersion",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: { name: { type: "string" } },
				required: ["name"],
				additionalProperties: false,
				"x-tombi-toml-version": "v1.0.0",
			},
		};
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("RootTomlVersion");
	});

	it("rejects x-tombi-toml-version inside a property", async () => {
		const schema: JsonSchemaOutput = {
			name: "NestedTomlVersion",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					name: { type: "string", "x-tombi-toml-version": "v1.0.0" },
				},
				required: ["name"],
				additionalProperties: false,
			},
		};
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				JsonSchemaValidator.Live,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-toml-version") && e.includes("root"))).toBe(true);
	});

	it("accepts x-tombi-string-formats at root", async () => {
		const schema: JsonSchemaOutput = {
			name: "RootStringFormats",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: { email: { type: "string" } },
				required: ["email"],
				additionalProperties: false,
				"x-tombi-string-formats": ["email"],
			},
		};
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("RootStringFormats");
	});

	it("rejects x-tombi-string-formats inside a property", async () => {
		const schema: JsonSchemaOutput = {
			name: "NestedStringFormats",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					email: { type: "string", "x-tombi-string-formats": ["email"] },
				},
				required: ["email"],
				additionalProperties: false,
			},
		};
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				JsonSchemaValidator.Live,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-string-formats") && e.includes("root"))).toBe(true);
	});

	// ── Object-node keywords ────────────────────────────────────────────────

	it("accepts x-tombi-table-keys-order on root object", async () => {
		const schema: JsonSchemaOutput = {
			name: "RootTableKeysOrder",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: { name: { type: "string" } },
				required: ["name"],
				additionalProperties: false,
				"x-tombi-table-keys-order": "schema",
			},
		};
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("RootTableKeysOrder");
	});

	it("accepts x-tombi-table-keys-order on nested object property", async () => {
		const schema: JsonSchemaOutput = {
			name: "NestedTableKeysOrder",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					server: {
						type: "object",
						properties: { host: { type: "string" } },
						additionalProperties: false,
						"x-tombi-table-keys-order": "ascending",
					},
				},
				additionalProperties: false,
			},
		};
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("NestedTableKeysOrder");
	});

	it("rejects x-tombi-table-keys-order on an array node", async () => {
		const schema: JsonSchemaOutput = {
			name: "ArrayTableKeysOrder",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					tags: {
						type: "array",
						items: { type: "string" },
						"x-tombi-table-keys-order": "ascending",
					},
				},
				additionalProperties: false,
			},
		};
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				JsonSchemaValidator.Live,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-table-keys-order") && e.includes("object"))).toBe(true);
	});

	it("accepts x-tombi-additional-key-label on object with additionalProperties", async () => {
		const schema: JsonSchemaOutput = {
			name: "ValidAdditionalKeyLabel",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					plugins: {
						type: "object",
						additionalProperties: { type: "string" },
						"x-tombi-additional-key-label": "plugin_name",
					},
				},
				additionalProperties: false,
			},
		};
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("ValidAdditionalKeyLabel");
	});

	it("rejects x-tombi-additional-key-label on object without additionalProperties", async () => {
		const schema: JsonSchemaOutput = {
			name: "InvalidAdditionalKeyLabel",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					plugins: {
						type: "object",
						properties: { name: { type: "string" } },
						"x-tombi-additional-key-label": "plugin_name",
					},
				},
				additionalProperties: false,
			},
		};
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				JsonSchemaValidator.Live,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(
			result.errors.some((e) => e.includes("x-tombi-additional-key-label") && e.includes("additionalProperties")),
		).toBe(true);
	});

	// ── Array-node keywords ─────────────────────────────────────────────────

	it("accepts x-tombi-array-values-order on array node", async () => {
		const schema: JsonSchemaOutput = {
			name: "ValidArrayOrder",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					tags: {
						type: "array",
						items: { type: "string" },
						"x-tombi-array-values-order": "ascending",
					},
				},
				additionalProperties: false,
			},
		};
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("ValidArrayOrder");
	});

	it("rejects x-tombi-array-values-order on object node", async () => {
		const schema: JsonSchemaOutput = {
			name: "InvalidArrayOrder",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					server: {
						type: "object",
						properties: { host: { type: "string" } },
						additionalProperties: false,
						"x-tombi-array-values-order": "ascending",
					},
				},
				additionalProperties: false,
			},
		};
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				JsonSchemaValidator.Live,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-array-values-order") && e.includes("array"))).toBe(true);
	});

	it("accepts x-tombi-array-values-order-by on object inside array items", async () => {
		const schema: JsonSchemaOutput = {
			name: "ValidArrayOrderBy",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					plugins: {
						type: "array",
						items: {
							type: "object",
							properties: {
								name: { type: "string" },
								version: { type: "string" },
							},
							required: ["name"],
							additionalProperties: false,
							"x-tombi-array-values-order-by": "name",
						},
					},
				},
				additionalProperties: false,
			},
		};
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("ValidArrayOrderBy");
	});

	it("rejects x-tombi-array-values-order-by on object NOT inside array items", async () => {
		const schema: JsonSchemaOutput = {
			name: "InvalidArrayOrderBy",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					server: {
						type: "object",
						properties: { name: { type: "string" } },
						additionalProperties: false,
						"x-tombi-array-values-order-by": "name",
					},
				},
				additionalProperties: false,
			},
		};
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				JsonSchemaValidator.Live,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-array-values-order-by") && e.includes("array items"))).toBe(
			true,
		);
	});

	// ── x-taplo ─────────────────────────────────────────────────────────────

	it("accepts x-taplo on root", async () => {
		const schema: JsonSchemaOutput = {
			name: "RootTaplo",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: { name: { type: "string" } },
				required: ["name"],
				additionalProperties: false,
				"x-taplo": { initKeys: ["name"] },
			},
		};
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("RootTaplo");
	});

	it("accepts x-taplo on property-level schema", async () => {
		const schema: JsonSchemaOutput = {
			name: "PropertyTaplo",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					server: {
						type: "object",
						properties: { host: { type: "string" } },
						additionalProperties: false,
						"x-taplo": { docs: { main: "Server settings" } },
					},
				},
				additionalProperties: false,
			},
		};
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("PropertyTaplo");
	});

	it("rejects x-taplo when present alongside $ref", async () => {
		const schema: JsonSchemaOutput = {
			name: "TaploWithRef",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					server: {
						$ref: "#/$defs/Server",
						"x-taplo": { docs: { main: "Server settings" } },
					},
				},
				$defs: {
					Server: {
						type: "object",
						properties: { host: { type: "string" } },
						additionalProperties: false,
					},
				},
				additionalProperties: false,
			},
		};
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				JsonSchemaValidator.Live,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-taplo") && e.includes("$ref"))).toBe(true);
	});

	// ── Non-strict mode still catches placement ─────────────────────────────

	it("catches misplaced annotations in non-strict mode", async () => {
		const schema: JsonSchemaOutput = {
			name: "NonStrictPlacement",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					name: { type: "string", "x-tombi-toml-version": "v1.0.0" },
				},
				required: ["name"],
				additionalProperties: false,
			},
		};
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					// Explicitly NOT using strict mode
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				JsonSchemaValidator.Live,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-toml-version") && e.includes("root"))).toBe(true);
	});
});
