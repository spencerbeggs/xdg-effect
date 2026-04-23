import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Layer, ParseResult, Schema } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { JsonSchemaValidationError } from "../../src/errors/JsonSchemaValidationError.js";
import { taplo } from "../../src/helpers/taplo.js";
import { tombi } from "../../src/helpers/tombi.js";
import { Jsonifiable } from "../../src/schemas/Jsonifiable.js";
import type { JsonSchemaClassStatics } from "../../src/schemas/JsonSchemaClass.js";
import { JsonSchemaClass } from "../../src/schemas/JsonSchemaClass.js";
import type { JsonSchemaOutput } from "../../src/services/JsonSchemaExporter.js";
import { JsonSchemaExporter } from "../../src/services/JsonSchemaExporter.js";
import { JsonSchemaValidator } from "../../src/services/JsonSchemaValidator.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const fixturesDir = join(import.meta.dirname, "fixtures");

const readFixture = (name: string): Record<string, unknown> =>
	JSON.parse(readFileSync(join(fixturesDir, name), "utf-8")) as Record<string, unknown>;

const toOutput = (name: string, schema: Record<string, unknown>): JsonSchemaOutput => ({ name, schema });

// ── Layers ───────────────────────────────────────────────────────────────────

const ExporterLayer = Layer.provide(JsonSchemaExporter.Live, NodeFileSystem.layer);
const ValidatorLayer = JsonSchemaValidator.Live;
const FullLayer = Layer.mergeAll(ExporterLayer, ValidatorLayer);

const runExporter = <A, E>(effect: Effect.Effect<A, E, JsonSchemaExporter>) =>
	Effect.runPromise(Effect.provide(effect, ExporterLayer));

const runValidator = <A, E>(effect: Effect.Effect<A, E, JsonSchemaValidator>) =>
	Effect.runPromise(Effect.provide(effect, ValidatorLayer));

const runFull = <A, E>(effect: Effect.Effect<A, E, JsonSchemaExporter | JsonSchemaValidator>) =>
	Effect.runPromise(Effect.provide(effect, FullLayer));

// ── Schema generation snapshots ─────────────────────────────────────────────

describe("schema generation snapshots", () => {
	it("generates a basic struct schema", async () => {
		const BasicStruct = Schema.Struct({
			name: Schema.String,
			port: Schema.Number,
			debug: Schema.optional(Schema.Boolean),
		});
		const result = await runExporter(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				return yield* exporter.generate({
					name: "BasicStruct",
					schema: BasicStruct,
					rootDefName: "BasicStruct",
				});
			}),
		);
		expect(result.schema).toMatchSnapshot();
	});

	it("generates a struct with $id", async () => {
		const Config = Schema.Struct({
			host: Schema.String,
			port: Schema.Number,
		});
		const result = await runExporter(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				return yield* exporter.generate({
					name: "Config",
					schema: Config,
					rootDefName: "Config",
					$id: "https://json.schemastore.org/my-config.json",
				});
			}),
		);
		expect(result.schema).toMatchSnapshot();
	});

	it("generates a struct with Jsonifiable field (no $id artifacts)", async () => {
		const PluginConfig = Schema.Struct({
			name: Schema.String,
			options: Jsonifiable,
		});
		const result = await runExporter(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				return yield* exporter.generate({
					name: "PluginConfig",
					schema: PluginConfig,
					rootDefName: "PluginConfig",
				});
			}),
		);
		expect(result.schema).toMatchSnapshot();
		const props = result.schema.properties as Record<string, Record<string, unknown>>;
		expect(props.options).not.toHaveProperty("$id");
	});

	it("generates a struct with Schema.Unknown field (cleanup strips artifacts)", async () => {
		const WithUnknown = Schema.Struct({
			name: Schema.String,
			metadata: Schema.Unknown,
		});
		const result = await runExporter(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				return yield* exporter.generate({
					name: "WithUnknown",
					schema: WithUnknown,
					rootDefName: "WithUnknown",
				});
			}),
		);
		expect(result.schema).toMatchSnapshot();
		const props = result.schema.properties as Record<string, Record<string, unknown>>;
		expect(props.metadata).not.toHaveProperty("$id");
		expect(props.metadata).not.toHaveProperty("title");
	});

	it("generates a Record schema (cleanup removes empty properties)", async () => {
		const Tags = Schema.Record({ key: Schema.String, value: Schema.String });
		const result = await runExporter(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				return yield* exporter.generate({
					name: "Tags",
					schema: Tags,
					rootDefName: "Tags",
				});
			}),
		);
		expect(result.schema).toMatchSnapshot();
		expect(result.schema).not.toHaveProperty("properties");
		expect(result.schema).toHaveProperty("additionalProperties");
	});

	it("generates a struct with all-optional fields (cleanup removes empty required)", async () => {
		const AllOptional = Schema.Struct({
			name: Schema.optional(Schema.String),
			debug: Schema.optional(Schema.Boolean),
		});
		const result = await runExporter(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				return yield* exporter.generate({
					name: "AllOptional",
					schema: AllOptional,
					rootDefName: "AllOptional",
				});
			}),
		);
		expect(result.schema).toMatchSnapshot();
		expect(result.schema).not.toHaveProperty("required");
	});

	it("places $id immediately after $schema in serialized output", async () => {
		const Config = Schema.Struct({
			host: Schema.String,
			port: Schema.Number,
		});
		const result = await runExporter(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				return yield* exporter.generate({
					name: "IdOrder",
					schema: Config,
					rootDefName: "IdOrder",
					$id: "https://json.schemastore.org/id-order.json",
					annotations: { "x-tombi-toml-version": "v1.1.0" },
				});
			}),
		);
		const serialized = JSON.stringify(result.schema, null, "\t");
		expect(serialized).toMatchSnapshot();
	});

	it("generates with tombi annotations", async () => {
		const Config = Schema.Struct({ name: Schema.String });
		const result = await runExporter(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				return yield* exporter.generate({
					name: "TombiConfig",
					schema: Config,
					rootDefName: "TombiConfig",
					annotations: {
						...tombi({
							tomlVersion: "v1.0.0",
							tableKeysOrder: "schema",
						}),
					},
				});
			}),
		);
		expect(result.schema).toMatchSnapshot();
		expect(result.schema["x-tombi-toml-version"]).toBe("v1.0.0");
		expect(result.schema["x-tombi-table-keys-order"]).toBe("schema");
	});

	it("generates with taplo annotations", async () => {
		const Config = Schema.Struct({ name: Schema.String });
		const result = await runExporter(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				return yield* exporter.generate({
					name: "TaploConfig",
					schema: Config,
					rootDefName: "TaploConfig",
					annotations: {
						...taplo({
							initKeys: ["name"],
							docs: { main: "Application configuration" },
						}),
					},
				});
			}),
		);
		expect(result.schema).toMatchSnapshot();
	});

	it("generates with combined tombi + taplo annotations", async () => {
		const Config = Schema.Struct({
			name: Schema.String,
			version: Schema.String,
		});
		const result = await runExporter(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				return yield* exporter.generate({
					name: "CombinedConfig",
					schema: Config,
					rootDefName: "CombinedConfig",
					$id: "https://json.schemastore.org/combined.json",
					annotations: {
						...tombi({ tomlVersion: "v1.0.0" }),
						...taplo({ initKeys: ["name", "version"] }),
					},
				});
			}),
		);
		expect(result.schema).toMatchSnapshot();
	});

	it("generates with combined tombi + taplo annotations (full snapshot)", async () => {
		const Config = Schema.Struct({
			name: Schema.String,
			version: Schema.String,
			debug: Schema.optional(Schema.Boolean),
		});
		const result = await runExporter(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				return yield* exporter.generate({
					name: "TombiTaploConfig",
					schema: Config,
					rootDefName: "TombiTaploConfig",
					$id: "https://json.schemastore.org/tombi-taplo.json",
					annotations: {
						...tombi({ tomlVersion: "v1.0.0", tableKeysOrder: "schema" }),
						...taplo({
							initKeys: ["name", "version"],
							docs: { main: "Combined annotation config" },
						}),
					},
				});
			}),
		);
		expect(result.schema).toMatchSnapshot();
		expect(result.schema["x-tombi-toml-version"]).toBe("v1.0.0");
		expect(result.schema["x-tombi-table-keys-order"]).toBe("schema");
		expect(result.schema["x-taplo"]).toEqual({
			initKeys: ["name", "version"],
			docs: { main: "Combined annotation config" },
		});
	});

	it("generates multiple schemas with generateMany", async () => {
		const SchemaA = Schema.Struct({ id: Schema.Number });
		const SchemaB = Schema.Struct({ name: Schema.String, tags: Schema.Array(Schema.String) });
		const results = await runExporter(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				return yield* exporter.generateMany([
					{ name: "SchemaA", schema: SchemaA, rootDefName: "SchemaA" },
					{ name: "SchemaB", schema: SchemaB, rootDefName: "SchemaB" },
				]);
			}),
		);
		expect(results.map((r) => r.schema)).toMatchSnapshot();
	});
});

// ── Validation: non-strict mode ─────────────────────────────────────────────

describe("validation: non-strict mode", () => {
	it("accepts a valid clean schema", async () => {
		const schema = readFixture("valid-clean-schema.json");
		const result = await runValidator(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(toOutput("valid-clean", schema));
			}),
		);
		expect(result.name).toBe("valid-clean");
	});

	it("accepts a schema with empty required (valid draft-07)", async () => {
		const schema = readFixture("schema-with-empty-required.json");
		const result = await runValidator(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(toOutput("empty-required", schema));
			}),
		);
		expect(result.name).toBe("empty-required");
	});

	it("accepts a schema missing additionalProperties in non-strict mode", async () => {
		const schema = readFixture("schema-missing-additional-properties.json");
		const result = await runValidator(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(toOutput("missing-ap", schema));
			}),
		);
		expect(result.name).toBe("missing-ap");
	});

	it("rejects a schema with invalid type", async () => {
		const schema = readFixture("schema-with-invalid-type.json");
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(toOutput("invalid-type", schema)).pipe(Effect.flip);
				}),
				ValidatorLayer,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.length).toBeGreaterThan(0);
	});
});

// ── Validation: strict mode ─────────────────────────────────────────────────

describe("validation: strict mode", () => {
	it("accepts a valid clean schema in strict mode", async () => {
		const schema = readFixture("valid-clean-schema.json");
		const result = await runValidator(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(toOutput("valid-clean", schema), { strict: true });
			}),
		);
		expect(result.name).toBe("valid-clean");
	});

	it("rejects missing additionalProperties in strict mode (Tombi compat)", async () => {
		const schema = readFixture("schema-missing-additional-properties.json");
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(toOutput("missing-ap", schema), { strict: true }).pipe(Effect.flip);
				}),
				ValidatorLayer,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("additionalProperties"))).toBe(true);
	});

	it("rejects invalid type in strict mode", async () => {
		const schema = readFixture("schema-with-invalid-type.json");
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(toOutput("invalid-type", schema), { strict: true }).pipe(Effect.flip);
				}),
				ValidatorLayer,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it("collects errors from validateMany across multiple schemas", async () => {
		const valid = toOutput("valid", readFixture("valid-clean-schema.json"));
		const missingAP = toOutput("missing-ap", readFixture("schema-missing-additional-properties.json"));
		const invalidType = toOutput("invalid-type", readFixture("schema-with-invalid-type.json"));
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validateMany([valid, missingAP, invalidType], { strict: true }).pipe(Effect.flip);
				}),
				ValidatorLayer,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.length).toBeGreaterThan(1);
	});
});

// ── E2E: generate -> validate -> write -> read back ─────────────────────────

describe("E2E pipeline", () => {
	let tmpDir: string;

	afterEach(() => {
		if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
	});

	it("full pipeline: generate -> strict validate -> write -> read back", async () => {
		tmpDir = mkdtempSync(join(tmpdir(), "xdg-int-test-"));
		const outputPath = join(tmpDir, "app-config.schema.json");

		const AppConfig = Schema.Struct({
			host: Schema.String,
			port: Schema.Number,
			debug: Schema.optional(Schema.Boolean),
		});

		const writeResult = await runFull(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				const validator = yield* JsonSchemaValidator;

				const generated = yield* exporter.generate({
					name: "AppConfig",
					schema: AppConfig,
					rootDefName: "AppConfig",
					$id: "https://json.schemastore.org/app-config.json",
				});
				const validated = yield* validator.validate(generated, { strict: true });
				return yield* exporter.write(validated, outputPath);
			}),
		);

		expect(writeResult._tag).toBe("Written");

		const onDisk = JSON.parse(readFileSync(outputPath, "utf-8")) as Record<string, unknown>;
		expect(onDisk).toMatchSnapshot();
	});

	it("second write returns Unchanged", async () => {
		tmpDir = mkdtempSync(join(tmpdir(), "xdg-int-test-"));
		const outputPath = join(tmpDir, "idempotent.schema.json");

		const SimpleSchema = Schema.Struct({ name: Schema.String });

		const result = await runExporter(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				const generated = yield* exporter.generate({
					name: "Simple",
					schema: SimpleSchema,
					rootDefName: "Simple",
				});
				yield* exporter.write(generated, outputPath);
				return yield* exporter.write(generated, outputPath);
			}),
		);
		expect(result._tag).toBe("Unchanged");
	});

	it("writeMany writes multiple schemas to disk", async () => {
		tmpDir = mkdtempSync(join(tmpdir(), "xdg-int-test-"));

		const A = Schema.Struct({ id: Schema.Number });
		const B = Schema.Struct({ name: Schema.String });

		const results = await runExporter(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				const outputs = yield* exporter.generateMany([
					{ name: "A", schema: A, rootDefName: "A" },
					{ name: "B", schema: B, rootDefName: "B" },
				]);
				return yield* exporter.writeMany([
					{ output: outputs[0], path: join(tmpDir, "a.json") },
					{ output: outputs[1], path: join(tmpDir, "b.json") },
				]);
			}),
		);
		expect(results).toHaveLength(2);
		expect(results.every((r) => r._tag === "Written")).toBe(true);
	});

	it("second write of Jsonifiable-containing schema returns Unchanged", async () => {
		tmpDir = mkdtempSync(join(tmpdir(), "xdg-int-test-"));
		const outputPath = join(tmpDir, "with-jsonifiable.schema.json");

		const Config = Schema.Struct({
			name: Schema.String,
			options: Jsonifiable,
		});

		const result = await runExporter(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				const generated = yield* exporter.generate({
					name: "Config",
					schema: Config,
					rootDefName: "Config",
				});
				yield* exporter.write(generated, outputPath);
				return yield* exporter.write(generated, outputPath);
			}),
		);
		expect(result._tag).toBe("Unchanged");
	});

	it("full pipeline with combined tombi + taplo annotations in strict mode", async () => {
		tmpDir = mkdtempSync(join(tmpdir(), "xdg-int-test-"));
		const outputPath = join(tmpDir, "annotated-config.schema.json");

		const AnnotatedConfig = Schema.Struct({
			name: Schema.String,
			version: Schema.String,
			debug: Schema.optional(Schema.Boolean),
		});

		const writeResult = await runFull(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				const validator = yield* JsonSchemaValidator;

				const generated = yield* exporter.generate({
					name: "AnnotatedConfig",
					schema: AnnotatedConfig,
					rootDefName: "AnnotatedConfig",
					$id: "https://json.schemastore.org/annotated-config.json",
					annotations: {
						...tombi({ tomlVersion: "v1.0.0", tableKeysOrder: "schema" }),
						...taplo({ initKeys: ["name", "version"], docs: { main: "Annotated config file" } }),
					},
				});
				const validated = yield* validator.validate(generated, { strict: true });
				return yield* exporter.write(validated, outputPath);
			}),
		);

		expect(writeResult._tag).toBe("Written");

		const onDisk = JSON.parse(readFileSync(outputPath, "utf-8")) as Record<string, unknown>;
		expect(onDisk["x-tombi-toml-version"]).toBe("v1.0.0");
		expect(onDisk["x-tombi-table-keys-order"]).toBe("schema");
		expect(onDisk["x-taplo"]).toEqual({
			initKeys: ["name", "version"],
			docs: { main: "Annotated config file" },
		});
		expect(onDisk).toMatchSnapshot();
	});

	it("full pipeline with annotations at multiple schema levels", async () => {
		tmpDir = mkdtempSync(join(tmpdir(), "xdg-int-test-"));
		const outputPath = join(tmpDir, "multi-level-annotations.schema.json");

		const MultiLevelConfig = Schema.Struct({
			name: Schema.String,
			plugins: Schema.Record({
				key: Schema.String.annotations({
					jsonSchema: tombi({ additionalKeyLabel: "plugin_name" }),
				}),
				value: Schema.Struct({
					enabled: Schema.Boolean,
				}).annotations({
					jsonSchema: {
						...taplo({ docs: { main: "Plugin configuration" } }),
					},
				}),
			}),
			tags: Schema.Array(Schema.String),
		});

		const writeResult = await runFull(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				const validator = yield* JsonSchemaValidator;

				const generated = yield* exporter.generate({
					name: "MultiLevelConfig",
					schema: MultiLevelConfig,
					rootDefName: "MultiLevelConfig",
					$id: "https://json.schemastore.org/multi-level.json",
					annotations: {
						...tombi({ tomlVersion: "v1.0.0", tableKeysOrder: "schema" }),
						...taplo({ initKeys: ["name"] }),
					},
				});
				const validated = yield* validator.validate(generated, { strict: true });
				return yield* exporter.write(validated, outputPath);
			}),
		);

		expect(writeResult._tag).toBe("Written");

		const onDisk = JSON.parse(readFileSync(outputPath, "utf-8")) as Record<string, unknown>;
		expect(onDisk["x-tombi-toml-version"]).toBe("v1.0.0");
		expect(onDisk["x-tombi-table-keys-order"]).toBe("schema");
		expect(onDisk["x-taplo"]).toEqual({ initKeys: ["name"] });
		expect(onDisk).toMatchSnapshot();
	});

	it("Jsonifiable field produces clean empty object in written file", async () => {
		tmpDir = mkdtempSync(join(tmpdir(), "xdg-int-test-"));
		const outputPath = join(tmpDir, "jsonifiable.schema.json");

		const Config = Schema.Struct({
			name: Schema.String,
			metadata: Jsonifiable,
		});

		await runExporter(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				const generated = yield* exporter.generate({
					name: "JsonifiableConfig",
					schema: Config,
					rootDefName: "JsonifiableConfig",
				});
				return yield* exporter.write(generated, outputPath);
			}),
		);

		const onDisk = JSON.parse(readFileSync(outputPath, "utf-8")) as Record<string, unknown>;
		expect(onDisk).toMatchSnapshot();
		const props = onDisk.properties as Record<string, unknown>;
		expect(props.metadata).toEqual({});
	});
});

// ── Validation: annotation placement ──────────────────────────────────────────

describe("validation: annotation placement", () => {
	it("rejects x-tombi-toml-version inside properties", async () => {
		const schema = toOutput("nested-toml-version", {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				name: { type: "string", "x-tombi-toml-version": "v1.0.0" },
			},
			additionalProperties: false,
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				ValidatorLayer,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-toml-version") && e.includes("root"))).toBe(true);
	});

	it("rejects x-tombi-string-formats inside properties", async () => {
		const schema = toOutput("nested-string-formats", {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				email: { type: "string", "x-tombi-string-formats": ["email"] },
			},
			additionalProperties: false,
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				ValidatorLayer,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-string-formats") && e.includes("root"))).toBe(true);
	});

	it("rejects x-tombi-table-keys-order on array node", async () => {
		const schema = toOutput("array-table-keys-order", {
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
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				ValidatorLayer,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-table-keys-order") && e.includes("object"))).toBe(true);
	});

	it("rejects x-tombi-additional-key-label on object without additionalProperties", async () => {
		const schema = toOutput("missing-ap-key-label", {
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
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				ValidatorLayer,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(
			result.errors.some((e) => e.includes("x-tombi-additional-key-label") && e.includes("additionalProperties")),
		).toBe(true);
	});

	it("rejects x-tombi-array-values-order on object node", async () => {
		const schema = toOutput("object-array-order", {
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
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				ValidatorLayer,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-array-values-order") && e.includes("array"))).toBe(true);
	});

	it("rejects x-tombi-array-values-order-by on object not inside array items", async () => {
		const schema = toOutput("non-array-order-by", {
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
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				ValidatorLayer,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-array-values-order-by") && e.includes("array items"))).toBe(
			true,
		);
	});

	it("warns when x-taplo is alongside $ref", async () => {
		const schema = toOutput("taplo-with-ref", {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				server: {
					$ref: "#/$defs/Server",
					"x-taplo": { docs: { main: "Server config" } },
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
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				ValidatorLayer,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-taplo") && e.includes("$ref"))).toBe(true);
	});

	it("accepts x-tombi-table-keys-order on nested object", async () => {
		const schema = toOutput("nested-table-keys", {
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
		});
		const result = await runValidator(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("nested-table-keys");
	});

	it("accepts x-taplo on property-level schema", async () => {
		const schema = toOutput("property-taplo", {
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
		});
		const result = await runValidator(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("property-taplo");
	});

	it("accepts x-tombi-additional-key-label on object with additionalProperties", async () => {
		const schema = toOutput("valid-key-label", {
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
		});
		const result = await runValidator(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("valid-key-label");
	});

	it("accepts x-tombi-array-values-order on array items", async () => {
		const schema = toOutput("valid-array-order", {
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
		});
		const result = await runValidator(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("valid-array-order");
	});

	it("accepts x-tombi-array-values-order-by on object inside array items", async () => {
		const schema = toOutput("valid-array-order-by", {
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
		});
		const result = await runValidator(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("valid-array-order-by");
	});

	it("catches misplaced annotations in non-strict mode", async () => {
		const schema = toOutput("non-strict-misplaced", {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				name: { type: "string", "x-tombi-toml-version": "v1.0.0" },
			},
			additionalProperties: false,
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				ValidatorLayer,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-toml-version"))).toBe(true);
	});
});

// ── JsonSchemaClass integration ─────────────────────────────────────────────

class TestAppConfig extends JsonSchemaClass<TestAppConfig>("TestAppConfig", {
	$id: "https://json.schemastore.org/test-app-config.json",
})({
	name: Schema.String,
	port: Schema.Number,
	debug: Schema.optionalWith(Schema.Boolean, { default: () => false }),
}) {}

describe("JsonSchemaClass integration", () => {
	it("schemaEntry generates correct schema via exporter", async () => {
		const result = await runExporter(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				return yield* exporter.generate(TestAppConfig.schemaEntry);
			}),
		);
		expect(result.schema).toMatchSnapshot();
		expect(result.schema.$id).toBe("https://json.schemastore.org/test-app-config.json");
	});

	it("toJson output matches snapshot", async () => {
		const config = TestAppConfig.make({ name: "my-app", port: 8080 });
		const json = await Effect.runPromise(TestAppConfig.toJson(config));
		expect(json).toMatchSnapshot();
		expect(json.$schema).toBe("https://json.schemastore.org/test-app-config.json");
	});

	it("validate accepts valid input", async () => {
		const result = await Effect.runPromise(TestAppConfig.validate({ name: "my-app", port: 8080 }));
		expect(result).toBeInstanceOf(TestAppConfig);
		expect(result.debug).toBe(false);
	});

	it("validate rejects invalid input", async () => {
		const error = await Effect.runPromise(TestAppConfig.validate({ name: 123 }).pipe(Effect.flip));
		expect(error).toBeInstanceOf(ParseResult.ParseError);
	});

	it("extended class inherits base $id and name in schemaEntry", () => {
		class ExtConfig extends TestAppConfig.extend<ExtConfig>("ExtConfig")({
			extra: Schema.String,
		}) {}
		// Extended classes inherit base $id and name — this is documented behavior.
		// The statics are inherited at runtime via prototype chain but not in the TS type.
		const ext = ExtConfig as unknown as JsonSchemaClassStatics<ExtConfig> & typeof ExtConfig;
		expect(ext.$id).toBe("https://json.schemastore.org/test-app-config.json");
		expect(ext.schemaEntry.name).toBe("TestAppConfig");
		expect(ext.schemaEntry.$id).toBe("https://json.schemastore.org/test-app-config.json");
	});

	it("extended class schema includes extended fields", async () => {
		class ExtConfig extends TestAppConfig.extend<ExtConfig>("ExtConfig")({
			extra: Schema.String,
		}) {}
		const ext = ExtConfig as unknown as JsonSchemaClassStatics<ExtConfig> & typeof ExtConfig;
		const result = await runExporter(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				return yield* exporter.generate(ext.schemaEntry);
			}),
		);
		expect(result.schema).toMatchSnapshot();
		// Extended schema should include the extra field
		const props = result.schema.properties as Record<string, unknown>;
		expect(props.extra).toBeDefined();
	});
});
