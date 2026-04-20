import { mkdirSync, rmSync } from "node:fs";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Duration, Effect, Layer, Option, PubSub, Queue } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeSqliteCacheLive } from "../src/layers/SqliteCacheLive.js";
import type { CacheEvent } from "../src/schemas/CacheEvent.js";
import { SqliteCache } from "../src/services/SqliteCache.js";

const tmpDir = `/tmp/xdg-cache-test-${Date.now()}`;
const cacheDir = `${tmpDir}/cache`;

const makeLayers = () => {
	const SqliteLive = SqliteClient.layer({ filename: `${cacheDir}/cache.db` });
	const CacheLayer = makeSqliteCacheLive();
	return Layer.provide(CacheLayer, SqliteLive);
};

describe("SqliteCache", () => {
	beforeEach(() => {
		mkdirSync(cacheDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("sets and gets a cache entry", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const cache = yield* SqliteCache;
					const value = new TextEncoder().encode(JSON.stringify({ hello: "world" }));
					yield* cache.set({ key: "test-key", value, tags: ["tag1"] });
					return yield* cache.get("test-key");
				}),
				makeLayers(),
			),
		);
		expect(Option.isSome(result)).toBe(true);
		if (Option.isSome(result)) {
			expect(result.value.key).toBe("test-key");
			const decoded = JSON.parse(new TextDecoder().decode(result.value.value));
			expect(decoded.hello).toBe("world");
		}
	});

	it("returns None for missing key", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const cache = yield* SqliteCache;
					return yield* cache.get("nonexistent");
				}),
				makeLayers(),
			),
		);
		expect(Option.isNone(result)).toBe(true);
	});

	it("invalidates by key", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const cache = yield* SqliteCache;
					const value = new TextEncoder().encode("data");
					yield* cache.set({ key: "to-delete", value });
					yield* cache.invalidate("to-delete");
					return yield* cache.has("to-delete");
				}),
				makeLayers(),
			),
		);
		expect(result).toBe(false);
	});

	it("invalidates by tag", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const cache = yield* SqliteCache;
					const value = new TextEncoder().encode("data");
					yield* cache.set({ key: "a", value, tags: ["group1"] });
					yield* cache.set({
						key: "b",
						value,
						tags: ["group1", "group2"],
					});
					yield* cache.set({ key: "c", value, tags: ["group2"] });
					yield* cache.invalidateByTag("group1");
					const hasA = yield* cache.has("a");
					const hasB = yield* cache.has("b");
					const hasC = yield* cache.has("c");
					return { hasA, hasB, hasC };
				}),
				makeLayers(),
			),
		);
		expect(result.hasA).toBe(false);
		expect(result.hasB).toBe(false);
		expect(result.hasC).toBe(true);
	});

	it("prunes expired entries", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const cache = yield* SqliteCache;
					const value = new TextEncoder().encode("data");
					yield* cache.set({
						key: "ephemeral",
						value,
						ttl: Duration.millis(1),
					});
					yield* Effect.sleep(Duration.millis(10));
					const pruneResult = yield* cache.prune;
					return pruneResult;
				}),
				makeLayers(),
			),
		);
		expect(result.count).toBeGreaterThanOrEqual(1);
	});

	it("emits events via PubSub", async () => {
		const events = await Effect.runPromise(
			Effect.provide(
				Effect.scoped(
					Effect.gen(function* () {
						const cache = yield* SqliteCache;
						const dequeue = yield* PubSub.subscribe(cache.events);
						const value = new TextEncoder().encode("data");
						yield* cache.set({ key: "evented", value });
						yield* cache.get("evented");
						yield* cache.get("missing-key");
						const collected: CacheEvent[] = [];
						let next = yield* Queue.poll(dequeue);
						while (Option.isSome(next)) {
							collected.push(next.value);
							next = yield* Queue.poll(dequeue);
						}
						return collected;
					}),
				),
				makeLayers(),
			),
		);
		const tags = events.map((e) => e.event._tag);
		expect(tags).toContain("Set");
		expect(tags).toContain("Hit");
		expect(tags).toContain("Miss");
	});
});
