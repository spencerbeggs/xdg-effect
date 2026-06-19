---
"xdg-effect": major
---

## Breaking Changes

- `SqliteCache.prune` and `SqliteCache.invalidateAll` are now **functions**, not
  bare `Effect` values. Update call sites: `yield* cache.prune` →
  `yield* cache.prune()`, `yield* cache.invalidateAll` →
  `yield* cache.invalidateAll()`.

## Features

- **Bulk-removal operations report which entries were removed.** `prune`,
  `invalidateByTag`, and `invalidateAll` now return
  `CacheRemovalResult { count, keys }` (a new public type; `PruneResult` is now an
  alias of it), and their cache events (`Pruned`, `InvalidatedByTag`,
  `InvalidatedAll`) carry the same `keys` array. This lets consumers react to the
  exact keys removed — for example, deleting on-disk artifacts a metadata entry
  was tracking — without separately enumerating the cache. Internally these
  operations now use a single atomic `DELETE … RETURNING key`, which also closes
  a check-then-delete race.
- **Optional in-transaction cleanup callback.** `invalidate`, `invalidateByTag`,
  `invalidateAll`, and `prune` accept an optional `onRemoved` callback that runs
  inside the same transaction as the delete, before commit. If the callback
  fails, the transaction rolls back (the delete is undone) and the corresponding
  event is not emitted — keeping a cache entry in lock-step with external side
  effects. The callback's error and requirement types propagate through to the
  operation's signature.
