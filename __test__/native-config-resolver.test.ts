import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Layer, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NativeConfigResolver } from "../src/resolvers/NativeConfigResolver.js";
import { XdgResolver } from "../src/services/XdgResolver.js";

describe("NativeConfigResolver", () => {
	let home: string;
	let originalPlatform: PropertyDescriptor | undefined;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "native-cfg-"));
		originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
	});

	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
		if (originalPlatform) {
			Object.defineProperty(process, "platform", originalPlatform);
		}
	});

	const runResolve = (namespace: string, filename: string, appData?: string) =>
		Effect.runPromise(
			Effect.scoped(
				Effect.provide(
					NativeConfigResolver({ namespace, filename }).resolve,
					Layer.mergeAll(
						XdgResolver.Test({ home, ...(appData !== undefined ? { appData } : {}) }),
						NodeFileSystem.layer,
					),
				),
			),
		);

	it("finds the file in the macOS Application Support dir", async () => {
		Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
		const dir = join(home, "Library", "Application Support", "my-tool");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "config.toml"), 'name = "x"\n');
		const result = await runResolve("my-tool", "config.toml");
		expect(Option.isSome(result)).toBe(true);
		expect(Option.getOrThrow(result)).toBe(join(dir, "config.toml"));
	});

	it("returns None when the native file does not exist", async () => {
		Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
		const result = await runResolve("my-tool", "config.toml");
		expect(Option.isNone(result)).toBe(true);
	});

	it("returns None on linux (no native probe)", async () => {
		Object.defineProperty(process, "platform", { value: "linux", configurable: true });
		// even if an Application Support file exists, linux must not probe it
		const dir = join(home, "Library", "Application Support", "my-tool");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "config.toml"), 'name = "x"\n');
		const result = await runResolve("my-tool", "config.toml");
		expect(Option.isNone(result)).toBe(true);
	});

	it("finds the file under APPDATA on win32", async () => {
		Object.defineProperty(process, "platform", { value: "win32", configurable: true });
		const roaming = join(home, "Roaming");
		const dir = join(roaming, "my-tool");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "config.toml"), 'name = "x"\n');
		const result = await runResolve("my-tool", "config.toml", roaming);
		expect(Option.isSome(result)).toBe(true);
		expect(Option.getOrThrow(result)).toBe(join(dir, "config.toml"));
	});
});
