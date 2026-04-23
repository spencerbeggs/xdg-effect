# Annotation Placement Validation

Defensive validation that catches misplaced `x-tombi-*` and `x-taplo` annotations in JSON Schema output before schemas go to production.

## Problem

The `tombi()` and `taplo()` helpers produce annotation keywords that are valid only at specific positions in the schema tree. The current validator registers all keywords with Ajv globally, so Ajv accepts them anywhere. A schema author can construct an invalid schema (e.g. `x-tombi-toml-version` buried inside a property definition) and the validator won't catch it.

## Approach: Single Walker With Two Check Categories

Rename `checkMissingAdditionalProperties` to `checkSchemaConventions`. One traversal, two categories of checks:

- Annotation placement (always runs) - at each node, check if any `x-tombi-*` or `x-taplo` keyword is present and whether it's valid at that position.
- Strict-mode checks (only when `strict: true`) - the existing `additionalProperties` check stays as-is.

### Walk Context

The walker tracks position as it recurses:

```typescript
interface WalkContext {
  isRoot: boolean;
  insideArrayItems: boolean;
}
```

`isRoot` starts `true` and flips to `false` after the root node. `insideArrayItems` flips to `true` when descending into `items` or `prefixItems`.

### Placement Rules as Data

A declarative rules table drives the checks:

```typescript
interface PlacementRule {
  isValid: (node: Record<string, unknown>, ctx: WalkContext) => boolean;
  reason: string;
}
```

Rules:

| Keyword | Valid condition | Error reason |
| ------- | -------------- | ------------ |
| `x-tombi-toml-version` | `ctx.isRoot` | must appear at schema root only |
| `x-tombi-string-formats` | `ctx.isRoot` | must appear at schema root only |
| `x-tombi-additional-key-label` | `node.type === "object"` and `node.additionalProperties !== undefined` | requires an object node with "additionalProperties" |
| `x-tombi-table-keys-order` | `node.type === "object"` | must appear on an object node |
| `x-tombi-array-values-order` | `node.type === "array"` or `node.items !== undefined` | must appear on an array node |
| `x-tombi-array-values-order-by` | `node.type === "object"` and `ctx.insideArrayItems` | must appear on an object node inside array items |
| `x-taplo` | `node.$ref === undefined` | ignored when $ref is present (likely a mistake) |

### EXTENSION_KEYWORDS Derived From Rules

```typescript
const EXTENSION_KEYWORDS = Object.keys(PLACEMENT_RULES) as ReadonlyArray<string>;
```

Keeps the Ajv keyword registration and placement rules in sync.

### Integration in validate/validateMany

The walker runs unconditionally. The `if (strict)` gate around the walker call is removed. The `strict` flag is passed into the walker to control which checks run internally:

```typescript
const conventionErrors = checkSchemaConventions(output.schema, "#", strict);
errors.push(...conventionErrors);
```

## Missing ajv Handling

Wrap the dynamic `import("ajv")` to catch module-not-found and produce a clear `JsonSchemaValidationError` with an install instruction instead of an opaque defect.

## Test Plan

### Unit Tests (json-schema-validator.test.ts)

New describe block "annotation placement":

Root-only enforcement:
- `x-tombi-toml-version` at root passes
- `x-tombi-toml-version` inside a property rejects
- `x-tombi-string-formats` at root passes
- `x-tombi-string-formats` inside a property rejects

Object-node enforcement:
- `x-tombi-table-keys-order` on root object passes
- `x-tombi-table-keys-order` on nested object property passes
- `x-tombi-table-keys-order` on an array node rejects
- `x-tombi-additional-key-label` on object with `additionalProperties` passes
- `x-tombi-additional-key-label` on object without `additionalProperties` rejects

Array-node enforcement:
- `x-tombi-array-values-order` on array node passes
- `x-tombi-array-values-order` on object node rejects
- `x-tombi-array-values-order-by` on object inside array items passes
- `x-tombi-array-values-order-by` on object NOT inside array items rejects

x-taplo:
- `x-taplo` on root passes
- `x-taplo` on property-level schema passes
- `x-taplo` on node with `$ref` warns

Non-strict mode:
- Misplaced annotation in non-strict mode still produces an error

### Integration Tests (json-schema-pipeline.int.test.ts)

New describe block "validation: annotation placement":

Invalid schemas (hand-crafted `JsonSchemaOutput`, not through exporter):
- `x-tombi-toml-version` inside `properties` - rejects
- `x-tombi-string-formats` inside `properties` - rejects
- `x-tombi-table-keys-order` on array node - rejects
- `x-tombi-additional-key-label` on object without `additionalProperties` - rejects
- `x-tombi-array-values-order` on object node - rejects
- `x-tombi-array-values-order-by` on object not inside array items - rejects
- `x-taplo` alongside `$ref` - warns

Valid non-root placements (should pass):
- `x-tombi-table-keys-order` on nested object - passes
- `x-taplo` on property-level schema - passes
- `x-tombi-additional-key-label` on object with `additionalProperties` - passes
- `x-tombi-array-values-order` on array items - passes
- `x-tombi-array-values-order-by` on object inside array items - passes

Non-strict still catches placement:
- Misplaced `x-tombi-toml-version` in non-strict mode - errors

Full pipeline with valid mixed annotations:
- Generate with root-level tombi + taplo, property-level taplo, validate strict, write, read back - snapshot

## Documentation Updates

Expand `docs/05-json-schema-advanced.md`:

1. Ajv dependency callout near the top of the Validator section: `ajv` must be installed, what happens if missing
2. New "Annotation Placement Rules" subsection: table of keywords and valid positions, note that placement checking is always-on (not gated on strict)
3. Update strict mode description to clarify annotation placement is separate and always-on

## Files Modified

- `src/layers/JsonSchemaValidatorLive.ts` - walker refactor, placement rules, ajv error handling
- `__test__/json-schema-validator.test.ts` - annotation placement unit tests
- `__test__/integration/json-schema-pipeline.int.test.ts` - annotation placement integration tests
- `__test__/integration/__snapshots__/json-schema-pipeline.int.test.ts.snap` - new snapshots
- `docs/05-json-schema-advanced.md` - ajv callout, placement rules docs, strict mode clarification
