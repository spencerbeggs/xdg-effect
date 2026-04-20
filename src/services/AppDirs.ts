import type { Effect, Option } from "effect";
import { Context } from "effect";
import type { AppDirsError } from "../errors/AppDirsError.js";
import type { ResolvedAppDirs } from "../schemas/ResolvedAppDirs.js";

export interface AppDirsService {
	readonly config: Effect.Effect<string, AppDirsError>;
	readonly data: Effect.Effect<string, AppDirsError>;
	readonly cache: Effect.Effect<string, AppDirsError>;
	readonly state: Effect.Effect<string, AppDirsError>;
	readonly runtime: Effect.Effect<Option.Option<string>, AppDirsError>;
	readonly resolveAll: Effect.Effect<ResolvedAppDirs, AppDirsError>;
	readonly ensure: Effect.Effect<ResolvedAppDirs, AppDirsError>;
}

export class AppDirs extends Context.Tag("xdg-effect/AppDirs")<AppDirs, AppDirsService>() {}
