import { JSONSchema } from "effect";
import { describe, expect, it } from "vitest";
import { Jsonifiable } from "../src/schemas/Jsonifiable.js";

describe("Jsonifiable", () => {
	it("produces an empty JSON Schema object (accepts any valid JSON)", () => {
		const schema = JSONSchema.make(Jsonifiable);
		expect(schema).toEqual({});
	});

	it("does not produce a $id artifact", () => {
		const schema = JSONSchema.make(Jsonifiable) as unknown as Record<string, unknown>;
		expect(schema).not.toHaveProperty("$id");
	});
});
