---
"xdg-effect": patch
---

## Bug Fixes

- Fixed `JsonSchemaValidator` failing in Ajv strict mode when schemas include `x-taplo` annotations — the keyword was not registered with Ajv, causing spurious strict-mode errors on otherwise valid schemas.
- Annotation placement checks (`x-tombi-*`, `x-taplo`) now run unconditionally on every `validate` and `validateMany` call rather than only in strict mode. Misplaced annotations are caught before schemas reach production regardless of the `strict` option.
- Wrapped the `ajv` dynamic import in `Effect.tryPromise` so that missing optional peer produces a structured `JsonSchemaValidationError` with an actionable install message instead of an untyped promise rejection.

## Refactoring

- Consolidated the annotation walker into a single `checkSchemaConventions` function backed by a declarative `PLACEMENT_RULES` table, making it straightforward to add or adjust placement rules for future annotation keywords.
