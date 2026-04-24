import { describe, expect, it } from "vitest";
import { AppDirsError, CacheError, StateError, XdgError } from "../src/index.js";

describe("XdgError", () => {
	it("has correct _tag", () => {
		const error = new XdgError({ message: "HOME not set" });
		expect(error._tag).toBe("XdgError");
		expect(error.message).toBe("HOME not set");
	});
});

describe("AppDirsError", () => {
	it("has correct _tag and message", () => {
		const error = new AppDirsError({
			directory: "config",
			reason: "resolution failed",
		});
		expect(error._tag).toBe("AppDirsError");
		expect(error.message).toContain("config");
		expect(error.message).toContain("resolution failed");
	});
});

describe("CacheError", () => {
	it("has correct _tag and message", () => {
		const error = new CacheError({
			operation: "get",
			key: "my-key",
			reason: "db locked",
		});
		expect(error._tag).toBe("CacheError");
		expect(error.message).toContain("get");
		expect(error.message).toContain("my-key");
	});
});

describe("StateError", () => {
	it("has correct _tag and message", () => {
		const error = new StateError({
			operation: "migrate",
			reason: "migration 3 failed",
		});
		expect(error._tag).toBe("StateError");
		expect(error.message).toContain("migrate");
	});
});
