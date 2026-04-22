import type { AppDirsError } from "./AppDirsError.js";
import type { CacheError } from "./CacheError.js";
import type { CodecError } from "./CodecError.js";
import type { ConfigError } from "./ConfigError.js";
import type { JsonSchemaError } from "./JsonSchemaError.js";
import type { JsonSchemaValidationError } from "./JsonSchemaValidationError.js";
import type { StateError } from "./StateError.js";
import type { XdgError } from "./XdgError.js";

export type XdgEffectError =
	| XdgError
	| AppDirsError
	| ConfigError
	| CodecError
	| JsonSchemaError
	| JsonSchemaValidationError
	| CacheError
	| StateError;
