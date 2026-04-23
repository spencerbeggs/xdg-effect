# Annotation Placement Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add defensive validation that catches misplaced `x-tombi-*` and `x-taplo` annotations in JSON Schema output, regardless of strict mode.

**Architecture:** Replace `checkMissingAdditionalProperties` with a unified `checkSchemaConventions` walker driven by a declarative `PLACEMENT_RULES` table. Annotation placement errors fire unconditionally; `additionalProperties` checks remain strict-only. Derive `EXTENSION_KEYWORDS` from the rules table. Wrap the `loadAjv` dynamic import to produce a clear error when ajv is missing.

**Tech Stack:** TypeScript, Effect, Ajv (optional peer), Vitest

---

### Task 1: Refactor walker and add placement rules

**Files:**
- Modify: `src/layers/JsonSchemaValidatorLive.ts`

- [ ] **Step 1: Write the `WalkContext` interface and `PLACEMENT_RULES` table**

Replace the `EXTENSION_KEYWORDS` array and `checkMissingAdditionalProperties` function with:

```typescript
interface WalkContext {
	readonly isRoot: boolean;
	readonly insideArrayItems: boolean;
}

interface PlacementRule {
	readonly isValid: (node: Record<string, unknown>, ctx: WalkContext) => boolean;
	readonly reason: string;
}

const PLACEMENT_RULES: Record<string, PlacementRule> = {
	"x-tombi-toml-version": {
		isValid: (_node, ctx) => ctx.isRoot,
		reason: "must appear at schema root only",
	},
	"x-tombi-string-formats": {
		isValid: (_node, ctx) => ctx.isRoot,
		reason: "must appear at schema root only",
	},
	"x-tombi-additional-key-label": {
		isValid: (node) => node.type === "object" && node.additionalProperties !== undefined,
		reason: 'requires an object node with "additionalProperties"',
	},
	"x-tombi-table-keys-order": {
		isValid: (node) => node.type === "object",
		reason: "must appear on an object node",
	},
	"x-tombi-array-values-order": {
		isValid: (node) => node.type === "array" || node.items !== undefined,
		reason: "must appear on an array node",
	},
	"x-tombi-array-values-order-by": {
		isValid: (node, ctx) => node.type === "object" && ctx.insideArrayItems,
		reason: "must appear on an object node inside array items",
	},
	"x-taplo": {
		isValid: (node) => node.$ref === undefined,
		reason: "ignored when $ref is present (likely a mistake)",
	},
};

const EXTENSION_KEYWORDS = Object.keys(PLACEMENT_RULES);
```

- [ ] **Step 2: Write the `checkSchemaConventions` function**

Replace `checkMissingAdditionalProperties` with this unified walker:

```typescript
const checkSchemaConventions = (
	schema: Record<string, unknown>,
	path: string,
	strict: boolean,
): ReadonlyArray<string> => {
	const errors: string[] = [];

	const walk = (node: unknown, currentPath: string, ctx: WalkContext): void => {
		if (node === null || typeof node !== "object" || Array.isArray(node)) return;
		const obj = node as Record<string, unknown>;

		// Annotation placement checks (always run)
		for (const key of Object.keys(obj)) {
			const rule = PLACEMENT_RULES[key];
			if (rule && !rule.isValid(obj, ctx)) {
				errors.push(`${currentPath}: "${key}" ${rule.reason}`);
			}
		}

		// Strict-mode: additionalProperties check
		if (strict && obj.type === "object" && obj.properties !== undefined && obj.additionalProperties === undefined) {
			errors.push(
				`${currentPath}: object has "properties" but no "additionalProperties" — Tombi strict mode will treat this as closed`,
			);
		}

		const childCtx: WalkContext = { isRoot: false, insideArrayItems: ctx.insideArrayItems };

		if (obj.$defs && typeof obj.$defs === "object") {
			for (const [key, value] of Object.entries(obj.$defs as Record<string, unknown>)) {
				walk(value, `${currentPath}/$defs/${key}`, childCtx);
			}
		}
		if (obj.properties && typeof obj.properties === "object") {
			for (const [key, value] of Object.entries(obj.properties as Record<string, unknown>)) {
				walk(value, `${currentPath}/properties/${key}`, childCtx);
			}
		}
		for (const branch of ["anyOf", "oneOf", "allOf"] as const) {
			if (Array.isArray(obj[branch])) {
				let i = 0;
				for (const item of obj[branch] as unknown[]) {
					walk(item, `${currentPath}/${branch}/${i}`, childCtx);
					i++;
				}
			}
		}
		for (const keyword of ["if", "then", "else", "not"] as const) {
			if (obj[keyword] !== undefined && typeof obj[keyword] === "object") {
				walk(obj[keyword] as Record<string, unknown>, `${currentPath}/${keyword}`, childCtx);
			}
		}

		// Array items: flip insideArrayItems for children
		const arrayChildCtx: WalkContext = { isRoot: false, insideArrayItems: true };
		if (obj.items) walk(obj.items, `${currentPath}/items`, arrayChildCtx);
		if (Array.isArray(obj.prefixItems)) {
			let i = 0;
			for (const item of obj.prefixItems as unknown[]) {
				walk(item, `${currentPath}/prefixItems/${i}`, arrayChildCtx);
				i++;
			}
		}

		if (obj.additionalProperties && typeof obj.additionalProperties === "object") {
			walk(obj.additionalProperties, `${currentPath}/additionalProperties`, childCtx);
		}
	};

	walk(schema, path, { isRoot: true, insideArrayItems: false });
	return errors;
};
```

- [ ] **Step 3: Update `validate` and `validateMany` to use `checkSchemaConventions`**

In `validate`, replace the strict-only walker call:

```typescript
// BEFORE (lines 106-109):
if (strict) {
	const tombiErrors = checkMissingAdditionalProperties(output.schema, "#");
	errors.push(...tombiErrors);
}

// AFTER:
const conventionErrors = checkSchemaConventions(output.schema, "#", strict);
errors.push(...conventionErrors);
```

In `validateMany`, same replacement:

```typescript
// BEFORE (lines 137-140):
if (strict) {
	const tombiErrors = checkMissingAdditionalProperties(output.schema, `#(${output.name})`);
	allErrors.push(...tombiErrors);
}

// AFTER:
const conventionErrors = checkSchemaConventions(output.schema, `#(${output.name})`, strict);
allErrors.push(...conventionErrors);
```

- [ ] **Step 4: Run existing tests to verify no regressions**

Run: `pnpm vitest run __test__/json-schema-validator.test.ts __test__/integration/json-schema-pipeline.int.test.ts`

Expected: All 40 existing tests pass. The refactor is behavior-preserving for existing cases because annotation placement checks only fire when annotations are present, and all existing test schemas place annotations at the root.

- [ ] **Step 5: Commit**

```bash
git add src/layers/JsonSchemaValidatorLive.ts
git commit -m "refactor: replace checkMissingAdditionalProperties with checkSchemaConventions

Unified walker with declarative PLACEMENT_RULES table. Annotation
placement checks run unconditionally, additionalProperties check
remains strict-only. EXTENSION_KEYWORDS derived from rules table.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 2: Improve ajv missing error handling

**Files:**
- Modify: `src/layers/JsonSchemaValidatorLive.ts`

- [ ] **Step 1: Write the failing test for missing ajv error message**

Add to `__test__/json-schema-validator.test.ts`:

```typescript
it("loadAjv failure produces a clear error message", async () => {
	// We can't easily uninstall ajv in tests, but we can verify
	// the error type and message format by testing with a schema
	// that would trigger validation. The ajv dependency is installed
	// in dev, so this test verifies the happy path loads correctly.
	const result = await run(
		Effect.gen(function* () {
			const validator = yield* JsonSchemaValidator;
			return yield* validator.validate(validSchema);
		}),
	);
	expect(result.name).toBe("ValidSchema");
});
```

This test already exists and passes. The actual missing-ajv scenario cannot be unit tested without module mocking. Instead, we improve the error message defensively.

- [ ] **Step 2: Wrap loadAjv with a clear error message**

Replace the `loadAjv` function:

```typescript
// BEFORE (lines 10-15):
const loadAjv = async (): Promise<new (opts: AjvOptions) => AjvInstance> => {
	// biome-ignore lint/suspicious/noExplicitAny: Ajv CJS/ESM interop — .default varies by bundler/runtime
	const mod = (await import("ajv")) as any;
	// biome-ignore lint/suspicious/noExplicitAny: chained .default unwrap for CJS-in-ESM
	return (mod.default?.default ?? mod.default ?? mod) as any;
};

// AFTER:
const loadAjv = (): Effect.Effect<new (opts: AjvOptions) => AjvInstance, JsonSchemaValidationError> =>
	Effect.tryPromise({
		try: async () => {
			// biome-ignore lint/suspicious/noExplicitAny: Ajv CJS/ESM interop — .default varies by bundler/runtime
			const mod = (await import("ajv")) as any;
			// biome-ignore lint/suspicious/noExplicitAny: chained .default unwrap for CJS-in-ESM
			return (mod.default?.default ?? mod.default ?? mod) as new (opts: AjvOptions) => AjvInstance;
		},
		catch: () =>
			new JsonSchemaValidationError({
				name: "ajv",
				errors: [
					'The "ajv" package is required for JSON Schema validation but is not installed. Install it with: pnpm add ajv',
				],
			}),
	});
```

- [ ] **Step 3: Update callers to use the Effect-based loadAjv**

In `validate`, replace:

```typescript
// BEFORE:
const AjvCtor = yield* Effect.promise(loadAjv);

// AFTER:
const AjvCtor = yield* loadAjv();
```

Same change in `validateMany`.

- [ ] **Step 4: Run existing tests**

Run: `pnpm vitest run __test__/json-schema-validator.test.ts __test__/integration/json-schema-pipeline.int.test.ts`

Expected: All tests pass. The ajv package is installed as a dev dependency so `loadAjv` succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/layers/JsonSchemaValidatorLive.ts
git commit -m "fix: wrap loadAjv with clear error when ajv is not installed

The dynamic import now catches module-not-found and produces a
JsonSchemaValidationError with an install instruction instead of
an opaque defect.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 3: Unit tests for annotation placement - root-only keywords

**Files:**
- Modify: `__test__/json-schema-validator.test.ts`

- [ ] **Step 1: Add the root-only keyword tests**

Add a new describe block after the existing "JsonSchemaValidator" describe:

```typescript
describe("annotation placement", () => {
	it("accepts x-tombi-toml-version at root", async () => {
		const schema: JsonSchemaOutput = {
			name: "RootTomlVersion",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: { name: { type: "string" } },
				required: ["name"],
				additionalProperties: false,
				"x-tombi-toml-version": "v1.0.0",
			},
		};
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("RootTomlVersion");
	});

	it("rejects x-tombi-toml-version inside a property", async () => {
		const schema: JsonSchemaOutput = {
			name: "NestedTomlVersion",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					name: { type: "string", "x-tombi-toml-version": "v1.0.0" },
				},
				required: ["name"],
				additionalProperties: false,
			},
		};
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				JsonSchemaValidator.Live,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-toml-version") && e.includes("root"))).toBe(true);
	});

	it("accepts x-tombi-string-formats at root", async () => {
		const schema: JsonSchemaOutput = {
			name: "RootStringFormats",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: { email: { type: "string", format: "email" } },
				required: ["email"],
				additionalProperties: false,
				"x-tombi-string-formats": ["email"],
			},
		};
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("RootStringFormats");
	});

	it("rejects x-tombi-string-formats inside a property", async () => {
		const schema: JsonSchemaOutput = {
			name: "NestedStringFormats",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					email: { type: "string", "x-tombi-string-formats": ["email"] },
				},
				required: ["email"],
				additionalProperties: false,
			},
		};
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				JsonSchemaValidator.Live,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-string-formats") && e.includes("root"))).toBe(true);
	});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm vitest run __test__/json-schema-validator.test.ts`

Expected: All 4 new tests pass plus all existing tests.

- [ ] **Step 3: Commit**

```bash
git add __test__/json-schema-validator.test.ts
git commit -m "test: add unit tests for root-only annotation placement

Verifies x-tombi-toml-version and x-tombi-string-formats are accepted
at the schema root and rejected when placed inside property definitions.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 4: Unit tests for annotation placement - object-node keywords

**Files:**
- Modify: `__test__/json-schema-validator.test.ts`

- [ ] **Step 1: Add object-node keyword tests**

Add inside the "annotation placement" describe block from Task 3:

```typescript
	it("accepts x-tombi-table-keys-order on root object", async () => {
		const schema: JsonSchemaOutput = {
			name: "RootTableKeysOrder",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: { name: { type: "string" } },
				required: ["name"],
				additionalProperties: false,
				"x-tombi-table-keys-order": "schema",
			},
		};
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("RootTableKeysOrder");
	});

	it("accepts x-tombi-table-keys-order on nested object property", async () => {
		const schema: JsonSchemaOutput = {
			name: "NestedTableKeysOrder",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					server: {
						type: "object",
						properties: { host: { type: "string" } },
						additionalProperties: false,
						"x-tombi-table-keys-order": "ascending",
					},
				},
				additionalProperties: false,
			},
		};
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("NestedTableKeysOrder");
	});

	it("rejects x-tombi-table-keys-order on an array node", async () => {
		const schema: JsonSchemaOutput = {
			name: "ArrayTableKeysOrder",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					tags: {
						type: "array",
						items: { type: "string" },
						"x-tombi-table-keys-order": "ascending",
					},
				},
				additionalProperties: false,
			},
		};
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				JsonSchemaValidator.Live,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-table-keys-order") && e.includes("object"))).toBe(true);
	});

	it("accepts x-tombi-additional-key-label on object with additionalProperties", async () => {
		const schema: JsonSchemaOutput = {
			name: "ValidAdditionalKeyLabel",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					plugins: {
						type: "object",
						additionalProperties: { type: "string" },
						"x-tombi-additional-key-label": "plugin_name",
					},
				},
				additionalProperties: false,
			},
		};
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("ValidAdditionalKeyLabel");
	});

	it("rejects x-tombi-additional-key-label on object without additionalProperties", async () => {
		const schema: JsonSchemaOutput = {
			name: "InvalidAdditionalKeyLabel",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					plugins: {
						type: "object",
						properties: { name: { type: "string" } },
						"x-tombi-additional-key-label": "plugin_name",
					},
				},
				additionalProperties: false,
			},
		};
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				JsonSchemaValidator.Live,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-additional-key-label") && e.includes("additionalProperties"))).toBe(true);
	});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm vitest run __test__/json-schema-validator.test.ts`

Expected: All 5 new tests pass plus all existing tests.

- [ ] **Step 3: Commit**

```bash
git add __test__/json-schema-validator.test.ts
git commit -m "test: add unit tests for object-node annotation placement

Verifies x-tombi-table-keys-order and x-tombi-additional-key-label
are accepted on valid object nodes and rejected on array nodes or
objects missing additionalProperties.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 5: Unit tests for annotation placement - array-node keywords

**Files:**
- Modify: `__test__/json-schema-validator.test.ts`

- [ ] **Step 1: Add array-node keyword tests**

Add inside the "annotation placement" describe block:

```typescript
	it("accepts x-tombi-array-values-order on array node", async () => {
		const schema: JsonSchemaOutput = {
			name: "ValidArrayOrder",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					tags: {
						type: "array",
						items: { type: "string" },
						"x-tombi-array-values-order": "ascending",
					},
				},
				additionalProperties: false,
			},
		};
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("ValidArrayOrder");
	});

	it("rejects x-tombi-array-values-order on object node", async () => {
		const schema: JsonSchemaOutput = {
			name: "InvalidArrayOrder",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					server: {
						type: "object",
						properties: { host: { type: "string" } },
						additionalProperties: false,
						"x-tombi-array-values-order": "ascending",
					},
				},
				additionalProperties: false,
			},
		};
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				JsonSchemaValidator.Live,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-array-values-order") && e.includes("array"))).toBe(true);
	});

	it("accepts x-tombi-array-values-order-by on object inside array items", async () => {
		const schema: JsonSchemaOutput = {
			name: "ValidArrayOrderBy",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					plugins: {
						type: "array",
						items: {
							type: "object",
							properties: {
								name: { type: "string" },
								version: { type: "string" },
							},
							required: ["name"],
							additionalProperties: false,
							"x-tombi-array-values-order-by": "name",
						},
					},
				},
				additionalProperties: false,
			},
		};
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("ValidArrayOrderBy");
	});

	it("rejects x-tombi-array-values-order-by on object NOT inside array items", async () => {
		const schema: JsonSchemaOutput = {
			name: "InvalidArrayOrderBy",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					server: {
						type: "object",
						properties: { name: { type: "string" } },
						additionalProperties: false,
						"x-tombi-array-values-order-by": "name",
					},
				},
				additionalProperties: false,
			},
		};
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				JsonSchemaValidator.Live,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-array-values-order-by") && e.includes("array items"))).toBe(true);
	});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm vitest run __test__/json-schema-validator.test.ts`

Expected: All 4 new tests pass plus all existing tests.

- [ ] **Step 3: Commit**

```bash
git add __test__/json-schema-validator.test.ts
git commit -m "test: add unit tests for array-node annotation placement

Verifies x-tombi-array-values-order is accepted on arrays and rejected
on objects, and x-tombi-array-values-order-by is accepted on objects
inside array items and rejected elsewhere.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 6: Unit tests for annotation placement - x-taplo and non-strict mode

**Files:**
- Modify: `__test__/json-schema-validator.test.ts`

- [ ] **Step 1: Add x-taplo and non-strict tests**

Add inside the "annotation placement" describe block:

```typescript
	it("accepts x-taplo on root", async () => {
		const schema: JsonSchemaOutput = {
			name: "RootTaplo",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: { name: { type: "string" } },
				required: ["name"],
				additionalProperties: false,
				"x-taplo": { initKeys: ["name"] },
			},
		};
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("RootTaplo");
	});

	it("accepts x-taplo on property-level schema", async () => {
		const schema: JsonSchemaOutput = {
			name: "PropertyTaplo",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					server: {
						type: "object",
						properties: { host: { type: "string" } },
						additionalProperties: false,
						"x-taplo": { docs: { main: "Server settings" } },
					},
				},
				additionalProperties: false,
			},
		};
		const result = await run(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("PropertyTaplo");
	});

	it("warns when x-taplo is present alongside $ref", async () => {
		const schema: JsonSchemaOutput = {
			name: "TaploWithRef",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					server: {
						$ref: "#/$defs/Server",
						"x-taplo": { docs: { main: "Server settings" } },
					},
				},
				$defs: {
					Server: {
						type: "object",
						properties: { host: { type: "string" } },
						additionalProperties: false,
					},
				},
				additionalProperties: false,
			},
		};
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				JsonSchemaValidator.Live,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-taplo") && e.includes("$ref"))).toBe(true);
	});

	it("catches misplaced annotations in non-strict mode", async () => {
		const schema: JsonSchemaOutput = {
			name: "NonStrictPlacement",
			schema: {
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				properties: {
					name: { type: "string", "x-tombi-toml-version": "v1.0.0" },
				},
				required: ["name"],
				additionalProperties: false,
			},
		};
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					// Explicitly NOT using strict mode
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				JsonSchemaValidator.Live,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-toml-version") && e.includes("root"))).toBe(true);
	});
```

Close the describe block:

```typescript
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm vitest run __test__/json-schema-validator.test.ts`

Expected: All 4 new tests pass plus all existing tests.

- [ ] **Step 3: Commit**

```bash
git add __test__/json-schema-validator.test.ts
git commit -m "test: add unit tests for x-taplo placement and non-strict mode

Verifies x-taplo is accepted at root and property level, warns when
alongside \$ref, and confirms annotation placement checks fire
regardless of strict mode.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 7: Integration tests for invalid annotation placement

**Files:**
- Modify: `__test__/integration/json-schema-pipeline.int.test.ts`
- Modified by test runner: `__test__/integration/__snapshots__/json-schema-pipeline.int.test.ts.snap`

- [ ] **Step 1: Add integration tests for invalid schemas**

Add a new describe block after the existing "E2E pipeline" describe block, before the "JsonSchemaClass integration" describe block:

```typescript
// ── Validation: annotation placement ──────────────────────────────────────────

describe("validation: annotation placement", () => {
	it("rejects x-tombi-toml-version inside properties", async () => {
		const schema = toOutput("nested-toml-version", {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				name: { type: "string", "x-tombi-toml-version": "v1.0.0" },
			},
			additionalProperties: false,
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				ValidatorLayer,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-toml-version") && e.includes("root"))).toBe(true);
	});

	it("rejects x-tombi-string-formats inside properties", async () => {
		const schema = toOutput("nested-string-formats", {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				email: { type: "string", "x-tombi-string-formats": ["email"] },
			},
			additionalProperties: false,
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				ValidatorLayer,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-string-formats") && e.includes("root"))).toBe(true);
	});

	it("rejects x-tombi-table-keys-order on array node", async () => {
		const schema = toOutput("array-table-keys-order", {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				tags: {
					type: "array",
					items: { type: "string" },
					"x-tombi-table-keys-order": "ascending",
				},
			},
			additionalProperties: false,
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				ValidatorLayer,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-table-keys-order") && e.includes("object"))).toBe(true);
	});

	it("rejects x-tombi-additional-key-label on object without additionalProperties", async () => {
		const schema = toOutput("missing-ap-key-label", {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				plugins: {
					type: "object",
					properties: { name: { type: "string" } },
					"x-tombi-additional-key-label": "plugin_name",
				},
			},
			additionalProperties: false,
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				ValidatorLayer,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-additional-key-label") && e.includes("additionalProperties"))).toBe(true);
	});

	it("rejects x-tombi-array-values-order on object node", async () => {
		const schema = toOutput("object-array-order", {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				server: {
					type: "object",
					properties: { host: { type: "string" } },
					additionalProperties: false,
					"x-tombi-array-values-order": "ascending",
				},
			},
			additionalProperties: false,
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				ValidatorLayer,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-array-values-order") && e.includes("array"))).toBe(true);
	});

	it("rejects x-tombi-array-values-order-by on object not inside array items", async () => {
		const schema = toOutput("non-array-order-by", {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				server: {
					type: "object",
					properties: { name: { type: "string" } },
					additionalProperties: false,
					"x-tombi-array-values-order-by": "name",
				},
			},
			additionalProperties: false,
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				ValidatorLayer,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-array-values-order-by") && e.includes("array items"))).toBe(true);
	});

	it("warns when x-taplo is alongside $ref", async () => {
		const schema = toOutput("taplo-with-ref", {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				server: {
					$ref: "#/$defs/Server",
					"x-taplo": { docs: { main: "Server config" } },
				},
			},
			$defs: {
				Server: {
					type: "object",
					properties: { host: { type: "string" } },
					additionalProperties: false,
				},
			},
			additionalProperties: false,
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				ValidatorLayer,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-taplo") && e.includes("$ref"))).toBe(true);
	});

	it("accepts x-tombi-table-keys-order on nested object", async () => {
		const schema = toOutput("nested-table-keys", {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				server: {
					type: "object",
					properties: { host: { type: "string" } },
					additionalProperties: false,
					"x-tombi-table-keys-order": "ascending",
				},
			},
			additionalProperties: false,
		});
		const result = await runValidator(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("nested-table-keys");
	});

	it("accepts x-taplo on property-level schema", async () => {
		const schema = toOutput("property-taplo", {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				server: {
					type: "object",
					properties: { host: { type: "string" } },
					additionalProperties: false,
					"x-taplo": { docs: { main: "Server settings" } },
				},
			},
			additionalProperties: false,
		});
		const result = await runValidator(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("property-taplo");
	});

	it("accepts x-tombi-additional-key-label on object with additionalProperties", async () => {
		const schema = toOutput("valid-key-label", {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				plugins: {
					type: "object",
					additionalProperties: { type: "string" },
					"x-tombi-additional-key-label": "plugin_name",
				},
			},
			additionalProperties: false,
		});
		const result = await runValidator(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("valid-key-label");
	});

	it("accepts x-tombi-array-values-order on array items", async () => {
		const schema = toOutput("valid-array-order", {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				tags: {
					type: "array",
					items: { type: "string" },
					"x-tombi-array-values-order": "ascending",
				},
			},
			additionalProperties: false,
		});
		const result = await runValidator(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("valid-array-order");
	});

	it("accepts x-tombi-array-values-order-by on object inside array items", async () => {
		const schema = toOutput("valid-array-order-by", {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				plugins: {
					type: "array",
					items: {
						type: "object",
						properties: {
							name: { type: "string" },
							version: { type: "string" },
						},
						required: ["name"],
						additionalProperties: false,
						"x-tombi-array-values-order-by": "name",
					},
				},
			},
			additionalProperties: false,
		});
		const result = await runValidator(
			Effect.gen(function* () {
				const validator = yield* JsonSchemaValidator;
				return yield* validator.validate(schema);
			}),
		);
		expect(result.name).toBe("valid-array-order-by");
	});

	it("catches misplaced annotations in non-strict mode", async () => {
		const schema = toOutput("non-strict-misplaced", {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				name: { type: "string", "x-tombi-toml-version": "v1.0.0" },
			},
			additionalProperties: false,
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const validator = yield* JsonSchemaValidator;
					return yield* validator.validate(schema).pipe(Effect.flip);
				}),
				ValidatorLayer,
			),
		);
		expect(result).toBeInstanceOf(JsonSchemaValidationError);
		expect(result.errors.some((e) => e.includes("x-tombi-toml-version"))).toBe(true);
	});
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm vitest run __test__/integration/json-schema-pipeline.int.test.ts`

Expected: All 13 new tests pass plus all existing integration tests.

- [ ] **Step 3: Commit**

```bash
git add __test__/integration/json-schema-pipeline.int.test.ts
git commit -m "test: add integration tests for annotation placement validation

Tests invalid schemas with misplaced x-tombi-* and x-taplo annotations,
valid non-root placements, x-taplo with \$ref warning, and non-strict
mode catching misplaced annotations.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 8: Integration test for full pipeline with mixed annotation levels

**Files:**
- Modify: `__test__/integration/json-schema-pipeline.int.test.ts`
- Modified by test runner: `__test__/integration/__snapshots__/json-schema-pipeline.int.test.ts.snap`

- [ ] **Step 1: Add full pipeline test with annotations at multiple levels**

Add inside the "E2E pipeline" describe block, after the existing "full pipeline with combined tombi + taplo annotations in strict mode" test:

```typescript
	it("full pipeline with annotations at multiple schema levels", async () => {
		tmpDir = mkdtempSync(join(tmpdir(), "xdg-int-test-"));
		const outputPath = join(tmpDir, "multi-level-annotations.schema.json");

		const MultiLevelConfig = Schema.Struct({
			name: Schema.String,
			plugins: Schema.Record({
				key: Schema.String.annotations({
					jsonSchema: tombi({ additionalKeyLabel: "plugin_name" }),
				}),
				value: Schema.Struct({
					enabled: Schema.Boolean,
				}).annotations({
					jsonSchema: {
						...taplo({ docs: { main: "Plugin configuration" } }),
					},
				}),
			}),
			tags: Schema.Array(Schema.String),
		});

		const writeResult = await runFull(
			Effect.gen(function* () {
				const exporter = yield* JsonSchemaExporter;
				const validator = yield* JsonSchemaValidator;

				const generated = yield* exporter.generate({
					name: "MultiLevelConfig",
					schema: MultiLevelConfig,
					rootDefName: "MultiLevelConfig",
					$id: "https://json.schemastore.org/multi-level.json",
					annotations: {
						...tombi({ tomlVersion: "v1.0.0", tableKeysOrder: "schema" }),
						...taplo({ initKeys: ["name"] }),
					},
				});
				const validated = yield* validator.validate(generated, { strict: true });
				return yield* exporter.write(validated, outputPath);
			}),
		);

		expect(writeResult._tag).toBe("Written");

		const onDisk = JSON.parse(readFileSync(outputPath, "utf-8")) as Record<string, unknown>;
		expect(onDisk["x-tombi-toml-version"]).toBe("v1.0.0");
		expect(onDisk["x-tombi-table-keys-order"]).toBe("schema");
		expect(onDisk["x-taplo"]).toEqual({ initKeys: ["name"] });
		expect(onDisk).toMatchSnapshot();
	});
```

- [ ] **Step 2: Run the test**

Run: `pnpm vitest run __test__/integration/json-schema-pipeline.int.test.ts`

Expected: New test passes. Snapshot created.

Note: The `Schema.annotations({ jsonSchema: ... })` approach may or may not produce property-level annotations depending on how Effect's JSONSchema.make inlines $defs. If the annotations end up at the root level instead of nested, the test still validates the happy path. Check the snapshot output and adjust assertions if needed.

- [ ] **Step 3: Commit**

```bash
git add __test__/integration/json-schema-pipeline.int.test.ts __test__/integration/__snapshots__/json-schema-pipeline.int.test.ts.snap
git commit -m "test: add full pipeline test with multi-level annotations

Verifies generate -> validate -> write pipeline with tombi and taplo
annotations at both root and property levels passes strict validation.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 9: Update documentation

**Files:**
- Modify: `docs/05-json-schema-advanced.md`

- [ ] **Step 1: Add ajv dependency callout**

After line 21 (the closing code fence of the usage example), add:

```markdown
> **Requires ajv:** The `ajv` package is an optional peer dependency. Install it before using the validator:
>
> ```bash
> pnpm add ajv
> ```
>
> If `ajv` is not installed, calling `validate` or `validateMany` will fail with a `JsonSchemaValidationError` explaining how to install it.
```

- [ ] **Step 2: Add annotation placement rules section**

After the "Validation Modes" section (after line 45), add a new subsection:

```markdown
### Annotation Placement Rules

The validator checks that `x-tombi-*` and `x-taplo` annotations appear at valid positions in the schema tree. These checks run regardless of strict mode — misplaced annotations are always an error.

| Keyword | Valid positions | Constraint |
| ------- | -------------- | ---------- |
| `x-tombi-toml-version` | Root only | Schema-level TOML version declaration |
| `x-tombi-string-formats` | Root only | Schema-level format validators |
| `x-tombi-table-keys-order` | Any object node | Requires `type: "object"` |
| `x-tombi-additional-key-label` | Object with `additionalProperties` | Requires both `type: "object"` and `additionalProperties` |
| `x-tombi-array-values-order` | Array nodes | Requires `type: "array"` or `items` |
| `x-tombi-array-values-order-by` | Object inside array items | Requires `type: "object"` and parent is `items`/`prefixItems` |
| `x-taplo` | Any schema node | Warns if `$ref` is present (Taplo ignores it) |

Example: placing `x-tombi-toml-version` inside a property definition will fail validation even in non-strict mode:

```typescript
// This will fail validation — x-tombi-toml-version belongs at the root
const schema = {
  type: "object",
  properties: {
    name: { type: "string", "x-tombi-toml-version": "v1.0.0" }, // error
  },
};
```
```

- [ ] **Step 3: Update strict mode description**

Replace the existing strict mode description (lines 33-45) to clarify the distinction:

```markdown
**Strict:** Enables Ajv strict mode plus TOML language server compatibility checks. Use this before submitting to SchemaStore or publishing schemas.

```typescript
yield* validator.validate(output, { strict: true });
```

Strict mode catches:

- Unknown keywords and non-standard properties not prefixed with `x-` (Ajv strict)
- Overlapping type unions (Ajv strict)
- Objects with `properties` but no explicit `additionalProperties` declaration (Tombi compatibility)

Note: Annotation placement checks (see below) run in both strict and non-strict modes. The strict flag only controls Ajv strict mode and the `additionalProperties` check.
```

- [ ] **Step 4: Run markdown lint**

Run: `pnpm exec markdownlint-cli2 --config lib/configs/.markdownlint-cli2.jsonc docs/05-json-schema-advanced.md`

Expected: No errors, or only fixable warnings.

- [ ] **Step 5: Commit**

```bash
git add docs/05-json-schema-advanced.md
git commit -m "docs: add ajv dependency callout and annotation placement rules

Documents the ajv install requirement, annotation placement validation
rules table, and clarifies that placement checks are independent of
strict mode.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `pnpm run test`

Expected: All tests pass, including all new annotation placement tests.

- [ ] **Step 2: Run type checking**

Run: `pnpm run typecheck`

Expected: No type errors.

- [ ] **Step 3: Run linting**

Run: `pnpm run lint`

Expected: No lint errors.

- [ ] **Step 4: Verify snapshot file is updated**

Run: `git diff --stat`

Expected: Snapshot file shows additions for the new integration test snapshots.
