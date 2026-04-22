---
"xdg-effect": patch
---

## Bug Fixes

- Fixed `JsonSchemaExporter` placing `$id` at the end of the root schema object instead of immediately after `$schema`. Generated schemas now consistently order `$schema` and `$id` as the first two keys, matching the conventional layout expected by schema registries and tooling. Closes #11.
