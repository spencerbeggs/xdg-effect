import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ExplicitPath } from "../src/resolvers/ExplicitPath.js";
import { StaticDir } from "../src/resolvers/StaticDir.js";
import { UpwardWalk } from "../src/resolvers/UpwardWalk.js";

const FsLayer = NodeFileSystem.layer;

const run = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
	Effect.runPromise(Effect.provide(effect, FsLayer));

describe("ExplicitPath", () => {
	it("returns Some when file exists", async () => {
		const tmpFile = `/tmp/xdg-resolver-test-${Date.now()}.json`;
		writeFileSync(tmpFile, "{}");
		try {
			const resolver = ExplicitPath(tmpFile);
			const result = await run(resolver.resolve);
			expect(Option.isSome(result)).toBe(true);
			expect(Option.getOrThrow(result)).toBe(tmpFile);
		} finally {
			rmSync(tmpFile, { force: true });
		}
	});

	it("returns None when file does not exist", async () => {
		const resolver = ExplicitPath("/tmp/does-not-exist-12345.json");
		const result = await run(resolver.resolve);
		expect(Option.isNone(result)).toBe(true);
	});
});

describe("StaticDir", () => {
	const tmpDir = `/tmp/xdg-static-test-${Date.now()}`;

	beforeEach(() => {
		mkdirSync(tmpDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns Some when file exists in directory", async () => {
		writeFileSync(join(tmpDir, "config.json"), "{}");
		const resolver = StaticDir({ dir: tmpDir, filename: "config.json" });
		const result = await run(resolver.resolve);
		expect(Option.isSome(result)).toBe(true);
		expect(Option.getOrThrow(result)).toBe(join(tmpDir, "config.json"));
	});

	it("returns None when file does not exist in directory", async () => {
		const resolver = StaticDir({ dir: tmpDir, filename: "missing.json" });
		const result = await run(resolver.resolve);
		expect(Option.isNone(result)).toBe(true);
	});
});

describe("UpwardWalk", () => {
	const tmpBase = `/tmp/xdg-walk-test-${Date.now()}`;
	const nested = join(tmpBase, "a", "b", "c");

	beforeEach(() => {
		mkdirSync(nested, { recursive: true });
	});

	afterEach(() => {
		rmSync(tmpBase, { recursive: true, force: true });
	});

	it("finds config file in parent directory", async () => {
		writeFileSync(join(tmpBase, "app.config.json"), "{}");
		const resolver = UpwardWalk({ filename: "app.config.json", cwd: nested });
		const result = await run(resolver.resolve);
		expect(Option.isSome(result)).toBe(true);
		expect(Option.getOrThrow(result)).toBe(join(tmpBase, "app.config.json"));
	});

	it("returns None when file is not found", async () => {
		const resolver = UpwardWalk({
			filename: "nonexistent.json",
			cwd: nested,
			stopAt: tmpBase,
		});
		const result = await run(resolver.resolve);
		expect(Option.isNone(result)).toBe(true);
	});

	it("respects stopAt boundary", async () => {
		writeFileSync(join(tmpBase, "app.config.json"), "{}");
		const resolver = UpwardWalk({
			filename: "app.config.json",
			cwd: nested,
			stopAt: join(tmpBase, "a"),
		});
		const result = await run(resolver.resolve);
		expect(Option.isNone(result)).toBe(true);
	});
});
