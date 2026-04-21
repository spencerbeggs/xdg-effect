import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Layer, Schema } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { JsonSchemaExporter } from "../src/services/JsonSchemaExporter.js";

const TestLayer = Layer.provide(JsonSchemaExporter.Live, NodeFileSystem.layer);

const run = <A, E>(effect: Effect.Effect<A, E, JsonSchemaExporter>) =>
	Effect.runPromise(Effect.provide(effect, TestLayer));

const TestSchema = Schema.Struct({
	name: Schema.String,
	port: Schema.Number,
});

const tmpDir = `/tmp/xdg-jsonschema-test-${Date.now()}`;

describe("JsonSchemaExporter", () => {
	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("generates a JSON Schema from an Effect Schema", async () => {
		const result = await run(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				return yield* exporter.generate({
					name: "TestConfig",
					schema: TestSchema,
					rootDefName: "TestConfig",
				});
			}),
		);
		expect(result.name).toBe("TestConfig");
		expect(result.schema.$schema).toBeDefined();
		expect(result.schema.type).toBe("object");
		expect((result.schema.properties as Record<string, unknown>)?.name).toBeDefined();
	});

	it("generates with annotations", async () => {
		const result = await run(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				return yield* exporter.generate({
					name: "TestConfig",
					schema: TestSchema,
					rootDefName: "TestConfig",
					annotations: { "x-tombi-toml-version": "v1.1.0" },
				});
			}),
		);
		expect(result.schema["x-tombi-toml-version"]).toBe("v1.1.0");
	});

	it("writes schema file and returns Written", async () => {
		const outputPath = join(tmpDir, "test.schema.json");
		const result = await run(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				const output = yield* exporter.generate({
					name: "TestConfig",
					schema: TestSchema,
					rootDefName: "TestConfig",
				});
				return yield* exporter.write(output, outputPath);
			}),
		);
		expect(result._tag).toBe("Written");
		const content = JSON.parse(readFileSync(outputPath, "utf-8"));
		expect(content.type).toBe("object");
	});

	it("returns Unchanged when file has not changed", async () => {
		const outputPath = join(tmpDir, "test.schema.json");
		const result = await run(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				const output = yield* exporter.generate({
					name: "TestConfig",
					schema: TestSchema,
					rootDefName: "TestConfig",
				});
				yield* exporter.write(output, outputPath);
				return yield* exporter.write(output, outputPath);
			}),
		);
		expect(result._tag).toBe("Unchanged");
	});
});

describe("JsonSchemaExporter.Test", () => {
	it("generates schemas in scoped test layer", async () => {
		const result = await Effect.runPromise(
			Effect.scoped(
				Effect.provide(
					Effect.gen(function* () {
						const exporter = yield* JsonSchemaExporter;
						return yield* exporter.generate({
							name: "TestSchema",
							schema: Schema.Struct({ name: Schema.String }),
							rootDefName: "TestSchema",
						});
					}),
					JsonSchemaExporter.Test,
				),
			),
		);
		expect(result.name).toBe("TestSchema");
		expect(result.schema).toBeDefined();
	});
});
