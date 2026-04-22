---
"xdg-effect": minor
---

## Features

- **`Jsonifiable` schema** — Drop-in replacement for `Schema.Unknown` in JSON Schema generation contexts. Unlike `Schema.Unknown`, it emits an empty schema (`{}`), which Ajv strict mode accepts as "any valid JSON instance" without producing `$id: "/schemas/unknown"` artifacts.

- **`JsonSchemaExporter` cleanup pass** — The exporter now automatically strips three classes of noise from generated schemas before writing: `$id: "/schemas/unknown"` artifacts (and their accompanying `title`), empty `required` arrays, and empty `properties` objects on Record-typed nodes. Existing callers receive cleaner output with no API changes.

- **`SchemaEntry.$id` field** — `SchemaEntry` accepts an optional `$id` field. When present, the generated schema receives a top-level `$id` written in the SchemaStore URL convention, enabling IDE schema association without extra post-processing.

- **`JsonSchemaValidator` service** — New opt-in service backed by Ajv that validates generated schemas before they are written to disk. Requires the optional peer dependency `ajv >= 8.0.0`.

  ```ts
  const program = Effect.gen(function* () {
    const exporter = yield* JsonSchemaExporter;
    const validator = yield* JsonSchemaValidator;

    const output = yield* exporter.generate(MyConfig.schemaEntry);
    yield* validator.validate(output, { strict: true });
  });

  program.pipe(
    Effect.provide(JsonSchemaExporter.Live),
    Effect.provide(JsonSchemaValidator.Live),
  );
  ```

  The `strict` option enables both Ajv strict mode and a Tombi compatibility check that flags any `object` schema with `properties` but no `additionalProperties`, which Tombi treats as a closed object.

- **`JsonSchemaValidationError`** — New tagged error (`"JsonSchemaValidationError"`) raised by `JsonSchemaValidator`. Carries the schema `name` and a `ReadonlyArray<string>` of human-readable error descriptions. Handle selectively with `Effect.catchTag("JsonSchemaValidationError", ...)`.

- **`tombi()` annotation helper** — Typed builder for `x-tombi-*` JSON Schema extensions. Accepts a `TombiOptions` object and returns a flat record of `x-tombi-*` keys for use in `SchemaEntry.annotations` or Effect Schema `jsonSchema` annotations. Compose with `taplo()` via object spread.

  ```ts
  import { tombi, taplo } from "xdg-effect";

  const annotations = {
    ...tombi({ tableKeysOrder: "schema", tomlVersion: "v1.0.0" }),
    ...taplo({ initKeys: ["name", "version"] }),
  };
  ```

- **`taplo()` annotation helper** — Typed builder for the `x-taplo` JSON Schema extension. Accepts a `TaploOptions` object (supporting `hidden`, `docs`, `links`, `initKeys`, and `custom`) and returns `{ "x-taplo": { ... } }`.

- **`JsonSchemaClass` factory** — `Schema.Class` wrapper that co-locates a schema's `$id` URL with its field definitions and generates convenience statics (`$id`, `schemaEntry`, `toJson`, `validate`) for the SchemaStore integration workflow.

  ```ts
  class AppConfig extends JsonSchemaClass<AppConfig>("AppConfig", {
    $id: "https://json.schemastore.org/app-config.json",
  })({
    name: Schema.String,
    port: Schema.Number,
  }) {}

  // Use with the exporter directly
  const output = yield* exporter.generate(AppConfig.schemaEntry);

  // Encode an instance with $schema injected
  const json = yield* AppConfig.toJson(new AppConfig({ name: "app", port: 3000 }));

  // Decode and validate unknown input
  const config = yield* AppConfig.validate(rawInput);
  ```

## Dependencies

| Dependency | Type | Action | From | To |
| :--- | :--- | :--- | :--- | :--- |
| ajv | peerDependency | added | — | 8.0.0 |
