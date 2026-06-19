import { mkdirSync, rmSync } from "node:fs";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Duration, Effect, Exit, Layer, Option, PubSub, Queue } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CacheError } from "../src/errors/CacheError.js";
import type { CacheEvent } from "../src/schemas/CacheEvent.js";
import { SqliteCache } from "../src/services/SqliteCache.js";

const tmpDir = `/tmp/xdg-cache-test-${Date.now()}`;
const cacheDir = `${tmpDir}/cache`;

const makeLayers = () => {
	const SqliteLive = SqliteClient.layer({ filename: `${cacheDir}/cache.db` });
	const CacheLayer = SqliteCache.Live();
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
					const pruneResult = yield* cache.prune();
					return pruneResult;
				}),
				makeLayers(),
			),
		);
		expect(result.count).toBeGreaterThanOrEqual(1);
		expect(result.keys).toContain("ephemeral");
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

describe("SqliteCache.Test", () => {
	it("provides in-memory cache", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const cache = yield* SqliteCache;
					yield* cache.set({
						key: "test-key",
						value: new TextEncoder().encode("test-value"),
					});
					return yield* cache.has("test-key");
				}),
				SqliteCache.Test(),
			),
		);
		expect(result).toBe(true);
	});

	it("returns None for expired entries on get", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const cache = yield* SqliteCache;
				yield* cache.set({ key: "ephemeral", value: new TextEncoder().encode("temp"), ttl: Duration.millis(1) });
				yield* Effect.sleep(Duration.millis(50));
				return yield* cache.get("ephemeral");
			}).pipe(Effect.scoped, Effect.provide(SqliteCache.Test())),
		);
		expect(Option.isNone(result)).toBe(true);
	});

	it("invalidateAll removes all entries", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const cache = yield* SqliteCache;
				const encoder = new TextEncoder();
				yield* cache.set({ key: "a", value: encoder.encode("1") });
				yield* cache.set({ key: "b", value: encoder.encode("2") });
				yield* cache.invalidateAll();
				const a = yield* cache.has("a");
				const b = yield* cache.has("b");
				return { a, b };
			}).pipe(Effect.scoped, Effect.provide(SqliteCache.Test())),
		);
		expect(result.a).toBe(false);
		expect(result.b).toBe(false);
	});

	it("invalidateByTag returns the removed keys", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const cache = yield* SqliteCache;
				const enc = new TextEncoder();
				yield* cache.set({ key: "a", value: enc.encode("1"), tags: ["g"] });
				yield* cache.set({ key: "b", value: enc.encode("2"), tags: ["g"] });
				yield* cache.set({ key: "c", value: enc.encode("3"), tags: ["other"] });
				return yield* cache.invalidateByTag("g");
			}).pipe(Effect.scoped, Effect.provide(SqliteCache.Test())),
		);
		expect(result.count).toBe(2);
		expect([...result.keys].sort()).toEqual(["a", "b"]);
	});

	it("invalidateAll returns the removed keys", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const cache = yield* SqliteCache;
				const enc = new TextEncoder();
				yield* cache.set({ key: "a", value: enc.encode("1") });
				yield* cache.set({ key: "b", value: enc.encode("2") });
				return yield* cache.invalidateAll();
			}).pipe(Effect.scoped, Effect.provide(SqliteCache.Test())),
		);
		expect(result.count).toBe(2);
		expect([...result.keys].sort()).toEqual(["a", "b"]);
	});

	it("prune runs the onRemoved callback with the removed keys", async () => {
		const seen: string[] = [];
		await Effect.runPromise(
			Effect.gen(function* () {
				const cache = yield* SqliteCache;
				yield* cache.set({ key: "ephemeral", value: new TextEncoder().encode("x"), ttl: Duration.millis(1) });
				yield* Effect.sleep(Duration.millis(20));
				yield* cache.prune((res) =>
					Effect.sync(() => {
						seen.push(...res.keys);
					}),
				);
			}).pipe(Effect.scoped, Effect.provide(SqliteCache.Test())),
		);
		expect(seen).toContain("ephemeral");
	});

	it("prune rolls back the delete when the onRemoved callback fails", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const cache = yield* SqliteCache;
				yield* cache.set({ key: "ephemeral", value: new TextEncoder().encode("x"), ttl: Duration.millis(1) });
				yield* Effect.sleep(Duration.millis(20));
				const exit = yield* cache
					.prune(() => Effect.fail(new CacheError({ operation: "prune", reason: "cleanup boom" })))
					.pipe(Effect.exit);
				// `entries` ignores expiry, so it reflects whether the row physically survived.
				const remaining = yield* cache.entries;
				return { failed: Exit.isFailure(exit), keys: remaining.map((e) => e.key) };
			}).pipe(Effect.scoped, Effect.provide(SqliteCache.Test())),
		);
		expect(result.failed).toBe(true);
		expect(result.keys).toContain("ephemeral");
	});

	it("invalidate runs the onRemoved callback when the key existed", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const cache = yield* SqliteCache;
				let called = false;
				yield* cache.set({ key: "k", value: new TextEncoder().encode("v") });
				yield* cache.invalidate("k", () =>
					Effect.sync(() => {
						called = true;
					}),
				);
				const present = yield* cache.has("k");
				return { called, present };
			}).pipe(Effect.scoped, Effect.provide(SqliteCache.Test())),
		);
		expect(result.called).toBe(true);
		expect(result.present).toBe(false);
	});

	it("invalidate does not run the onRemoved callback when the key is absent", async () => {
		const called = await Effect.runPromise(
			Effect.gen(function* () {
				const cache = yield* SqliteCache;
				let ran = false;
				yield* cache.invalidate("missing", () =>
					Effect.sync(() => {
						ran = true;
					}),
				);
				return ran;
			}).pipe(Effect.scoped, Effect.provide(SqliteCache.Test())),
		);
		expect(called).toBe(false);
	});

	it("invalidate rolls back the delete when the onRemoved callback fails", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const cache = yield* SqliteCache;
				yield* cache.set({ key: "k", value: new TextEncoder().encode("v") });
				const exit = yield* cache
					.invalidate("k", () => Effect.fail(new CacheError({ operation: "invalidate", key: "k", reason: "boom" })))
					.pipe(Effect.exit);
				const present = yield* cache.has("k");
				return { failed: Exit.isFailure(exit), present };
			}).pipe(Effect.scoped, Effect.provide(SqliteCache.Test())),
		);
		expect(result.failed).toBe(true);
		expect(result.present).toBe(true);
	});

	it("Pruned event carries the removed keys", async () => {
		const events = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const cache = yield* SqliteCache;
					const dequeue = yield* PubSub.subscribe(cache.events);
					yield* cache.set({ key: "gone", value: new TextEncoder().encode("x"), ttl: Duration.millis(1) });
					yield* Effect.sleep(Duration.millis(20));
					yield* cache.prune();
					const collected: CacheEvent[] = [];
					let next = yield* Queue.poll(dequeue);
					while (Option.isSome(next)) {
						collected.push(next.value);
						next = yield* Queue.poll(dequeue);
					}
					return collected;
				}),
			).pipe(Effect.provide(SqliteCache.Test())),
		);
		const pruned = events.find((e) => e.event._tag === "Pruned");
		expect(pruned).toBeDefined();
		if (pruned && pruned.event._tag === "Pruned") {
			expect(pruned.event.keys).toContain("gone");
		}
	});

	it("InvalidatedAll event carries the removed keys", async () => {
		const events = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const cache = yield* SqliteCache;
					const dequeue = yield* PubSub.subscribe(cache.events);
					const enc = new TextEncoder();
					yield* cache.set({ key: "a", value: enc.encode("1") });
					yield* cache.set({ key: "b", value: enc.encode("2") });
					yield* cache.invalidateAll();
					const collected: CacheEvent[] = [];
					let next = yield* Queue.poll(dequeue);
					while (Option.isSome(next)) {
						collected.push(next.value);
						next = yield* Queue.poll(dequeue);
					}
					return collected;
				}),
			).pipe(Effect.provide(SqliteCache.Test())),
		);
		const all = events.find((e) => e.event._tag === "InvalidatedAll");
		expect(all).toBeDefined();
		if (all && all.event._tag === "InvalidatedAll") {
			expect([...all.event.keys].sort()).toEqual(["a", "b"]);
		}
	});

	it("InvalidatedByTag event carries the removed keys", async () => {
		const events = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const cache = yield* SqliteCache;
					const dequeue = yield* PubSub.subscribe(cache.events);
					const enc = new TextEncoder();
					yield* cache.set({ key: "a", value: enc.encode("1"), tags: ["g"] });
					yield* cache.set({ key: "b", value: enc.encode("2"), tags: ["g"] });
					yield* cache.invalidateByTag("g");
					const collected: CacheEvent[] = [];
					let next = yield* Queue.poll(dequeue);
					while (Option.isSome(next)) {
						collected.push(next.value);
						next = yield* Queue.poll(dequeue);
					}
					return collected;
				}),
			).pipe(Effect.provide(SqliteCache.Test())),
		);
		const tagged = events.find((e) => e.event._tag === "InvalidatedByTag");
		expect(tagged).toBeDefined();
		if (tagged && tagged.event._tag === "InvalidatedByTag") {
			expect([...tagged.event.keys].sort()).toEqual(["a", "b"]);
		}
	});

	it("entries returns metadata for all stored entries", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const cache = yield* SqliteCache;
				const encoder = new TextEncoder();
				yield* cache.set({ key: "x", value: encoder.encode("hello"), contentType: "text/plain", tags: ["tag1"] });
				yield* cache.set({ key: "y", value: encoder.encode("world") });
				return yield* cache.entries;
			}).pipe(Effect.scoped, Effect.provide(SqliteCache.Test())),
		);
		expect(result.length).toBe(2);
		const x = result.find((e) => e.key === "x");
		expect(x?.contentType).toBe("text/plain");
		expect(x?.sizeBytes).toBe(5);
	});
});
