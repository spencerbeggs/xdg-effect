import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { JsonSchemaClass } from "../src/schemas/JsonSchemaClass.js";

class TestConfig extends JsonSchemaClass<TestConfig>("TestConfig", {
	$id: "https://json.schemastore.org/test-config.json",
})({
	name: Schema.String,
	port: Schema.Number,
	debug: Schema.optionalWith(Schema.Boolean, { default: () => false }),
}) {}

describe("JsonSchemaClass", () => {
	it("constructs instances via make()", () => {
		const config = TestConfig.make({ name: "app", port: 3000 });
		expect(config.name).toBe("app");
		expect(config.port).toBe(3000);
		expect(config.debug).toBe(false);
	});

	it("exposes static $id", () => {
		expect(TestConfig.$id).toBe("https://json.schemastore.org/test-config.json");
	});

	it("produces a SchemaEntry with name, schema, rootDefName, and $id", () => {
		const entry = TestConfig.schemaEntry;
		expect(entry.name).toBe("TestConfig");
		expect(entry.rootDefName).toBe("TestConfig");
		expect(entry.$id).toBe("https://json.schemastore.org/test-config.json");
		expect(entry.schema).toBeDefined();
	});

	it("toJson encodes with $schema key injected", async () => {
		const config = TestConfig.make({ name: "app", port: 3000 });
		const json = await Effect.runPromise(TestConfig.toJson(config));
		expect(json.$schema).toBe("https://json.schemastore.org/test-config.json");
		expect(json.name).toBe("app");
		expect(json.port).toBe(3000);
		expect(json.debug).toBe(false);
	});

	it("validate decodes valid unknown input", async () => {
		const result = await Effect.runPromise(TestConfig.validate({ name: "app", port: 3000 }));
		expect(result).toBeInstanceOf(TestConfig);
		expect(result.name).toBe("app");
		expect(result.debug).toBe(false);
	});

	it("validate fails on invalid input", async () => {
		const error = await Effect.runPromise(TestConfig.validate({ name: 123 }).pipe(Effect.flip));
		expect(error._tag).toBe("ParseError");
	});

	it("supports extend()", () => {
		class ExtendedConfig extends TestConfig.extend<ExtendedConfig>("ExtendedConfig")({
			extra: Schema.String,
		}) {}
		const config = ExtendedConfig.make({ name: "app", port: 3000, extra: "val" });
		expect(config.name).toBe("app");
		expect(config.extra).toBe("val");
	});
});
