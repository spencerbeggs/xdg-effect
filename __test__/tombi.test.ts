import { describe, expect, it } from "vitest";
import { tombi } from "../src/helpers/tombi.js";

describe("tombi", () => {
	it("maps tomlVersion to x-tombi-toml-version", () => {
		const result = tombi({ tomlVersion: "v1.0.0" });
		expect(result).toEqual({ "x-tombi-toml-version": "v1.0.0" });
	});

	it("maps additionalKeyLabel to x-tombi-additional-key-label", () => {
		const result = tombi({ additionalKeyLabel: "group_name" });
		expect(result).toEqual({ "x-tombi-additional-key-label": "group_name" });
	});

	it("maps tableKeysOrder to x-tombi-table-keys-order", () => {
		const result = tombi({ tableKeysOrder: "schema" });
		expect(result).toEqual({ "x-tombi-table-keys-order": "schema" });
	});

	it("maps arrayValuesOrder to x-tombi-array-values-order", () => {
		const result = tombi({ arrayValuesOrder: "ascending" });
		expect(result).toEqual({ "x-tombi-array-values-order": "ascending" });
	});

	it("maps arrayValuesOrderBy to x-tombi-array-values-order-by", () => {
		const result = tombi({ arrayValuesOrderBy: "name" });
		expect(result).toEqual({ "x-tombi-array-values-order-by": "name" });
	});

	it("maps stringFormats to x-tombi-string-formats", () => {
		const result = tombi({ stringFormats: ["email", "uri"] });
		expect(result).toEqual({ "x-tombi-string-formats": ["email", "uri"] });
	});

	it("combines multiple options into flat x-tombi-* keys", () => {
		const result = tombi({
			tomlVersion: "v1.0.0",
			tableKeysOrder: "schema",
		});
		expect(result).toEqual({
			"x-tombi-toml-version": "v1.0.0",
			"x-tombi-table-keys-order": "schema",
		});
	});

	it("spreads custom entries into the result", () => {
		const result = tombi({
			tomlVersion: "v1.0.0",
			custom: { "x-tombi-experimental": true },
		});
		expect(result).toEqual({
			"x-tombi-toml-version": "v1.0.0",
			"x-tombi-experimental": true,
		});
	});

	it("returns an empty object for empty options", () => {
		const result = tombi({});
		expect(result).toEqual({});
	});
});
