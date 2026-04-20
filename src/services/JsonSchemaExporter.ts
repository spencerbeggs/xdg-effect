import type { Effect, Schema } from "effect";
import { Context } from "effect";
import type { JsonSchemaError } from "../errors/JsonSchemaError.js";
import type { WriteResult } from "../schemas/WriteResult.js";

export interface SchemaEntry {
	readonly name: string;
	// biome-ignore lint/suspicious/noExplicitAny: Schema type params are invariant — any is required to accept all schemas
	readonly schema: Schema.Schema<any, any, never>;
	readonly rootDefName: string;
	readonly annotations?: Record<string, unknown>;
}

export interface JsonSchemaOutput {
	readonly name: string;
	readonly schema: Record<string, unknown>;
}

export interface JsonSchemaExporterService {
	readonly generate: (entry: SchemaEntry) => Effect.Effect<JsonSchemaOutput, JsonSchemaError>;
	readonly generateMany: (
		entries: ReadonlyArray<SchemaEntry>,
	) => Effect.Effect<ReadonlyArray<JsonSchemaOutput>, JsonSchemaError>;
	readonly write: (output: JsonSchemaOutput, path: string) => Effect.Effect<WriteResult, JsonSchemaError>;
	readonly writeMany: (
		outputs: ReadonlyArray<{ output: JsonSchemaOutput; path: string }>,
	) => Effect.Effect<ReadonlyArray<WriteResult>, JsonSchemaError>;
}

export class JsonSchemaExporter extends Context.Tag("xdg-effect/JsonSchemaExporter")<
	JsonSchemaExporter,
	JsonSchemaExporterService
>() {}
