# Platform-native config search

By default, xdg-effect resolves XDG-style paths (`~/.config/<app>`) on every OS. macOS and Windows apps that follow platform guidance store config in native locations instead. This page covers the native resolver, AppDirs native mode and the `layered` preset.

## Native locations

| Platform | Config directory |
| -------- | ---------------- |
| macOS | `~/Library/Application Support/<app>` |
| Windows | `%APPDATA%\<app>` |
| Linux | `~/.config/<app>` (XDG — unchanged) |

## `NativeConfigResolver` — native as a fallback

`NativeConfigResolver({ namespace, filename })` probes the native config directory. Chain it **after** `XdgConfigResolver` so an existing `~/.config/<app>` still wins. On Linux it returns nothing (XDG already owns that path).

```typescript
import { NativeConfigResolver, XdgConfigResolver } from "xdg-effect";

const resolvers = [
  XdgConfigResolver({ filename: "config.toml" }),
  NativeConfigResolver({ namespace: "my-tool", filename: "config.toml" }),
];
```

## AppDirs native mode — native as the primary location

Set `native: true` on the app config so `AppDirs` resolves native directories directly. An explicitly-set `XDG_CONFIG_HOME` still wins (env overrides stay authoritative); on Linux, native mode is a no-op.

```typescript
import { AppDirsConfig } from "xdg-effect";

const app = new AppDirsConfig({ namespace: "my-tool", native: true });
// macOS: AppDirs.config -> ~/Library/Application Support/my-tool
```

## `XdgConfigLive.layered` — the full chain

`layered` wires project → user → system discovery in one layer: an upward walk across `projectSubpaths` (dot-config convention), the XDG config dir, the native config dir and `/etc/<app>`.

```typescript
import { XdgConfigLive } from "xdg-effect";
import { TomlCodec } from "config-file-effect";

const layer = XdgConfigLive.layered({
  namespace: "my-tool",
  filename: "config.toml",
  tag: MyConfigTag,
  schema: MyConfigSchema,
  codec: TomlCodec,
  projectSubpaths: [".", ".config"], // default
  native: true,                       // default
  system: true,                       // default
});
```

Pass `native: false` or `system: false` to drop a tier.
