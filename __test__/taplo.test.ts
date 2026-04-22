import { describe, expect, it } from "vitest";
import { taplo } from "../src/helpers/taplo.js";

describe("taplo", () => {
	it("wraps options under the x-taplo key", () => {
		const result = taplo({ hidden: true });
		expect(result).toEqual({ "x-taplo": { hidden: true } });
	});

	it("maps docs with main and enumValues", () => {
		const result = taplo({
			docs: { main: "Primary field", enumValues: ["first", null, "third"] },
		});
		expect(result).toEqual({
			"x-taplo": {
				docs: { main: "Primary field", enumValues: ["first", null, "third"] },
			},
		});
	});

	it("maps links with key and enumValues", () => {
		const result = taplo({
			links: { key: "https://example.com", enumValues: ["https://a.com", null] },
		});
		expect(result).toEqual({
			"x-taplo": {
				links: { key: "https://example.com", enumValues: ["https://a.com", null] },
			},
		});
	});

	it("maps initKeys", () => {
		const result = taplo({ initKeys: ["name", "version"] });
		expect(result).toEqual({ "x-taplo": { initKeys: ["name", "version"] } });
	});

	it("combines multiple options", () => {
		const result = taplo({
			hidden: false,
			initKeys: ["name"],
			docs: { defaultValue: "unnamed" },
		});
		expect(result).toEqual({
			"x-taplo": {
				hidden: false,
				initKeys: ["name"],
				docs: { defaultValue: "unnamed" },
			},
		});
	});

	it("merges custom entries into x-taplo object", () => {
		const result = taplo({
			hidden: true,
			custom: { experimental: "value" },
		});
		expect(result).toEqual({
			"x-taplo": { hidden: true, experimental: "value" },
		});
	});

	it("returns x-taplo with empty object for empty options", () => {
		const result = taplo({});
		expect(result).toEqual({ "x-taplo": {} });
	});
});
