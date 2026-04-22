# JSON Schema Generation

If your tool uses TOML or JSON config files, you can generate JSON Schema files from your Effect Schema definitions. Editors and tools like Tombi use these schemas for autocompletion, validation, and documentation.

## Why JSON Schema

- **Editor autocompletion** — VS Code, IntelliJ, and other editors load JSON Schema files to provide field suggestions, type hints, and inline documentation for config files
- **Config file validation** — editors report schema violations as diagnostics before your application ever runs, catching typos and type mismatches early
- **Tombi integration** — Tombi is a TOML language server that reads JSON Schema to provide autocompletion and validation for `.toml` files; generating a schema once unlocks full editor support
- **Documentation** — a JSON Schema file is machine-readable documentation of every field your config format accepts, including types, defaults, and descriptions

## JsonSchemaExporter Service

`JsonSchemaExporter` provides four methods organized into two pairs: generate (schema to JSON object) and write (JSON object to disk).

```typescript
interface JsonSchemaExporterService {
  readonly generate: (entry: SchemaEntry) => Effect<JsonSchemaOutput, JsonSchemaError>;
  readonly generateMany: (entries: ReadonlyArray<SchemaEntry>) => Effect<ReadonlyArray<JsonSchemaOutput>, JsonSchemaError>;
  readonly write: (output: JsonSchemaOutput, path: string) => Effect<WriteResult, JsonSchemaError>;
  readonly writeMany: (outputs: ReadonlyArray<{ output: JsonSchemaOutput; path: string }>) => Effect<ReadonlyArray<WriteResult>, JsonSchemaError>;
}
```

`generate` and `generateMany` convert Effect Schema definitions into JSON Schema objects in memory. `write` and `writeMany` persist those objects to disk.

## Jsonifiable

`Jsonifiable` is a drop-in replacement for `Schema.Unknown` in definitions that will be serialized to JSON Schema.

```typescript
import { Jsonifiable } from "xdg-effect";
import { Schema } from "effect";

const MyConfig = Schema.Struct({
  name: Schema.String,
  metadata: Jsonifiable, // accepts any JSON-serializable value
});
```

`Schema.Unknown` produces a `$id: "/schemas/unknown"` artifact in the generated JSON Schema. This artifact causes Ajv strict-mode validation failures. `Jsonifiable` emits an empty schema object (`{}`) instead, which JSON Schema interprets as "accepts any valid instance" — the correct semantics for an arbitrary JSON value.

Use `Jsonifiable` anywhere your schema accepts a value that will be serialized to JSON: catch-all metadata fields, plugin options, extra properties, and similar open-ended fields.

### SchemaEntry

Pass a `SchemaEntry` to `generate` to describe what to export:

```typescript
interface SchemaEntry {
  readonly name: string;
  readonly schema: Schema.Schema<any, any, never>;
  readonly rootDefName: string;
  readonly $id?: string;           // top-level $id for the generated schema
  readonly annotations?: Record<string, unknown>;
}
```

- `name` — identifier used in error messages and as the output name
- `schema` — any Effect Schema with no context requirements (`R = never`)
- `rootDefName` — the definition name Effect Schema uses for the root type in `$defs`; used for `$ref` inlining (see [Tombi Integration](#tombi-integration)). The `rootDefName` should match the name that Effect's JSON Schema generator assigns to the root type in its `$defs` section. For a `Schema.Struct` assigned to a variable like `MyToolConfig`, use `"MyToolConfig"`. For `Schema.Class` types, use the class name. The exporter uses this to inline the root definition for compatibility with tools that don't support `$ref`.
- `$id` — top-level `$id` URL for the generated schema. Recommended for SchemaStore-compatible schemas; use `https://json.schemastore.org/your-schema.json` as the convention.
- `annotations` — extra top-level properties to merge into the generated schema object (for example, Tombi `x-tombi-*` extensions)

### Cleanup Behavior

`generate` automatically runs a cleanup pass on the raw output from Effect's JSON Schema generator before returning. The cleanup strips three categories of artifacts:

- **`$id: "/schemas/unknown"` artifacts** — produced when `Schema.Unknown` appears in a definition; use `Jsonifiable` to avoid these in the first place, or rely on the cleanup pass to remove them
- **Empty `required: []` arrays** — Effect emits an empty `required` array for structs with no required fields; the cleanup removes it to avoid noisy diffs
- **Empty `properties: {}` on Record objects** — structs using `additionalProperties` with no fixed keys produce an empty `properties` object; the cleanup removes it

This happens automatically. Consumers do not need to post-process the output.

### JsonSchemaOutput

`generate` returns a `JsonSchemaOutput`:

```typescript
interface JsonSchemaOutput {
  readonly name: string;
  readonly schema: Record<string, unknown>;
}
```

`schema` is the plain JSON Schema object, ready to serialize or inspect.

### WriteResult

`write` returns a `WriteResult` rather than `void` so callers can distinguish whether the file changed:

```typescript
type WriteResult =
  | { readonly _tag: "Written"; readonly path: string }
  | { readonly _tag: "Unchanged"; readonly path: string };
```

Before writing, `write` reads the existing file (if any) and deep-compares it to the new schema. If the content is identical, it returns `Unchanged` and skips the write. This prevents unnecessary file churn in build pipelines and version control.

## Runnable Example

The following program generates a JSON Schema from a config schema and writes it to disk:

```typescript
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { JsonSchemaExporter } from "xdg-effect";

const MyToolConfig = Schema.Struct({
  name: Schema.String,
  port: Schema.Number,
  debug: Schema.optional(Schema.Boolean, { default: () => false }),
  allowedHosts: Schema.optional(Schema.Array(Schema.String), {
    default: () => [],
  }),
});

const program = Effect.gen(function* () {
  const exporter = yield* JsonSchemaExporter;

  // Generate the schema
  const output = yield* exporter.generate({
    name: "my-tool-config",
    schema: MyToolConfig,
    rootDefName: "MyToolConfig",
    $id: "https://json.schemastore.org/my-tool-config.json",
  });

  console.log(JSON.stringify(output.schema, null, 2));

  // Write to disk (skips if unchanged)
  const result = yield* exporter.write(output, "./schemas/my-tool-config.json");
  if (result._tag === "Written") {
    console.log(`Schema written to ${result.path}`);
  } else {
    console.log(`Schema unchanged at ${result.path}`);
  }
});

Effect.runPromise(
  program.pipe(
    Effect.provide(JsonSchemaExporter.Live),
    Effect.provide(NodeFileSystem.layer),
  ),
);
```

`JsonSchemaExporter.Live` requires only `FileSystem` from `@effect/platform`. It has no dependency on `XdgResolver` or `AppDirs` — it is independent of the XDG stack and is intended as a build-time utility, not a runtime service.

## Tombi Integration

[Tombi](https://github.com/tombi-toml/tombi) is a TOML language server. When pointed at a JSON Schema file, it provides autocompletion, hover documentation, and inline validation for `.toml` files in your editor.

### The $ref inlining behavior

Effect Schema generates JSON Schema with a root `$ref` pointing into `$defs`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$ref": "#/$defs/MyToolConfig",
  "$defs": {
    "MyToolConfig": { ... }
  }
}
```

Tombi does not support top-level `$ref`. `JsonSchemaExporter` automatically inlines the root `$ref` definition by merging the referenced definition into the top level and removing it from `$defs`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": { ... }
}
```

This happens for the definition named by `rootDefName`. Nested `$ref` entries within `properties` and `$defs` are left intact.

### Tombi annotations

Use the `annotations` field in `SchemaEntry` to add Tombi-specific extensions to the generated schema. Tombi recognizes properties prefixed with `x-tombi-`:

```typescript
const output = yield* exporter.generate({
  name: "my-tool-config",
  schema: MyToolConfig,
  rootDefName: "MyToolConfig",
  annotations: {
    "x-tombi-toml-version": "v1.0",
  },
});
```

Each key-value pair in `annotations` is set as a top-level property on the output schema object after inlining.

## Build Step Integration

Schema generation is a build-time operation. The recommended pattern is a dedicated script that runs before your build or as a standalone `generate-schemas` task.

### Script approach

Create a `scripts/generate-schemas.ts` file in your project:

```typescript
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { JsonSchemaExporter } from "xdg-effect";

const MyToolConfig = Schema.Struct({
  name: Schema.String,
  port: Schema.Number,
  debug: Schema.optional(Schema.Boolean, { default: () => false }),
  allowedHosts: Schema.optional(Schema.Array(Schema.String), {
    default: () => [],
  }),
});

const program = Effect.gen(function* () {
  const exporter = yield* JsonSchemaExporter;
  const output = yield* exporter.generate({
    name: "my-tool-config",
    schema: MyToolConfig,
    rootDefName: "MyToolConfig",
  });
  const result = yield* exporter.write(output, "./schemas/my-tool-config.json");
  console.log(result._tag === "Written" ? `Written: ${result.path}` : `Unchanged: ${result.path}`);
});

Effect.runPromise(
  program.pipe(
    Effect.provide(JsonSchemaExporter.Live),
    Effect.provide(NodeFileSystem.layer),
  ),
);
```

Then add a script to `package.json`:

```json
{
  "scripts": {
    "generate-schemas": "tsx scripts/generate-schemas.ts"
  }
}
```

### Committing schema files

Commit the generated schema files to your repository. This means editors can use them immediately after cloning, without requiring a build step. It also makes schema diffs visible in code review — a useful signal when the config format changes.

The diff-based skip behavior of `write` (returning `Unchanged` when content is identical) makes this practical: running `generate-schemas` on an unchanged schema produces no file modification, so it is safe to run in CI without generating spurious diffs.

---

[Previous: Config Files](./03-config-files.md) | [Next: JSON Schema Advanced](./05-json-schema-advanced.md)
