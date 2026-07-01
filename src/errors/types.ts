import type { AppDirsError } from "./AppDirsError.js";
import type { CacheError } from "./CacheError.js";
import type { StateError } from "./StateError.js";
import type { XdgError } from "./XdgError.js";

/**
 * Union of every tagged error the package's services can raise.
 *
 * @public
 */
export type XdgEffectError = XdgError | AppDirsError | CacheError | StateError;
