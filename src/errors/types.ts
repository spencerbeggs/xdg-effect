import type { AppDirsError } from "./AppDirsError.js";
import type { CacheError } from "./CacheError.js";
import type { StateError } from "./StateError.js";
import type { XdgError } from "./XdgError.js";

export type XdgEffectError = XdgError | AppDirsError | CacheError | StateError;
