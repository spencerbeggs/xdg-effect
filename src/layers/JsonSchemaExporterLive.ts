import { FileSystem } from "@effect/platform";
import { Effect, JSONSchema, Layer } from "effect";
import { JsonSchemaError } from "../errors/JsonSchemaError.js";
import { Unchanged, Written } from "../schemas/WriteResult.js";
// biome-ignore lint/suspicious/noImportCycles: layer intentionally co-locates with its service tag
import type { JsonSchemaOutput, SchemaEntry } from "../services/JsonSchemaExporter.js";
// biome-ignore lint/suspicious/noImportCycles: layer intentionally co-locates with its service tag
import { JsonSchemaExporter } from "../services/JsonSchemaExporter.js";

const inlineRootRef = (schema: Record<string, unknown>, defName: string): Record<string, unknown> => {
	const defs = schema.$defs as Record<string, Record<string, unknown>> | undefined;
	if (!defs?.[defName]) return schema;

	const rootDef = { ...defs[defName] };
	const remainingDefs = { ...defs };
	delete remainingDefs[defName];

	const result: Record<string, unknown> = {
		$schema: schema.$schema,
		...rootDef,
	};

	if (Object.keys(remainingDefs).length > 0) {
		result.$defs = remainingDefs;
	}

	return result;
};

const cleanSchema = (node: unknown): unknown => {
	if (Array.isArray(node)) return node.map(cleanSchema);
	if (node === null || typeof node !== "object") return node;

	const obj = { ...(node as Record<string, unknown>) };

	// Strip undefined-valued keys (e.g. from Jsonifiable's annotation override)
	// so the in-memory object matches the JSON-serialized form
	for (const key of Object.keys(obj)) {
		if (obj[key] === undefined) delete obj[key];
	}

	// Rule 1: Strip $id: "/schemas/unknown" artifacts
	if (obj.$id === "/schemas/unknown") {
		delete obj.$id;
		delete obj.title;
	}

	// Rule 2: Remove empty required arrays
	if (Array.isArray(obj.required) && obj.required.length === 0) {
		delete obj.required;
	}

	// Rule 3: Remove empty properties on Record objects
	if (
		obj.additionalProperties !== undefined &&
		obj.properties !== undefined &&
		typeof obj.properties === "object" &&
		obj.properties !== null &&
		Object.keys(obj.properties as Record<string, unknown>).length === 0
	) {
		delete obj.properties;
	}

	// Recurse into known schema locations
	if (obj.$defs && typeof obj.$defs === "object") {
		const defs = obj.$defs as Record<string, unknown>;
		const cleaned: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(defs)) {
			cleaned[key] = cleanSchema(value);
		}
		obj.$defs = cleaned;
	}
	for (const branch of ["anyOf", "oneOf", "allOf"] as const) {
		if (Array.isArray(obj[branch])) {
			obj[branch] = (obj[branch] as unknown[]).map(cleanSchema);
		}
	}
	for (const keyword of ["if", "then", "else", "not"] as const) {
		if (obj[keyword] !== undefined && typeof obj[keyword] === "object") {
			obj[keyword] = cleanSchema(obj[keyword]);
		}
	}
	if (obj.items !== undefined) obj.items = cleanSchema(obj.items);
	if (Array.isArray(obj.prefixItems)) {
		obj.prefixItems = (obj.prefixItems as unknown[]).map(cleanSchema);
	}
	if (obj.additionalProperties !== undefined && typeof obj.additionalProperties === "object") {
		obj.additionalProperties = cleanSchema(obj.additionalProperties);
	}
	if (obj.properties !== undefined && typeof obj.properties === "object" && obj.properties !== null) {
		const props = obj.properties as Record<string, unknown>;
		const cleaned: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(props)) {
			cleaned[key] = cleanSchema(value);
		}
		obj.properties = cleaned;
	}

	return obj;
};

const deepEqual = (a: unknown, b: unknown): boolean => {
	if (a === b) return true;
	if (typeof a !== typeof b) return false;
	if (a === null || b === null) return false;
	if (typeof a !== "object") return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((val, i) => deepEqual(val, b[i]));
	}
	const aObj = a as Record<string, unknown>;
	const bObj = b as Record<string, unknown>;
	const aKeys = Object.keys(aObj);
	const bKeys = Object.keys(bObj);
	if (aKeys.length !== bKeys.length) return false;
	return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
};

const generateOne = (entry: SchemaEntry): Effect.Effect<JsonSchemaOutput, JsonSchemaError> =>
	Effect.try({
		try: () => {
			const raw = JSONSchema.make(entry.schema) as unknown as Record<string, unknown>;
			const inlined = inlineRootRef(raw, entry.rootDefName);
			const cleaned = cleanSchema(inlined) as Record<string, unknown>;
			if (entry.$id) {
				cleaned.$id = entry.$id;
			}
			if (entry.annotations) {
				for (const [key, value] of Object.entries(entry.annotations)) {
					cleaned[key] = value;
				}
			}
			// Reorder so $schema and $id appear first
			const ordered: Record<string, unknown> = {};
			if (cleaned.$schema !== undefined) ordered.$schema = cleaned.$schema;
			if (cleaned.$id !== undefined) ordered.$id = cleaned.$id;
			for (const [key, value] of Object.entries(cleaned)) {
				if (key !== "$schema" && key !== "$id") {
					ordered[key] = value;
				}
			}
			return { name: entry.name, schema: ordered };
		},
		catch: (error) =>
			new JsonSchemaError({
				operation: "generate",
				name: entry.name,
				reason: String(error),
			}),
	});

export const JsonSchemaExporterLiveImpl = (): Layer.Layer<JsonSchemaExporter, never, FileSystem.FileSystem> =>
	Layer.effect(
		JsonSchemaExporter,
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;

			const writeSingle = (output: JsonSchemaOutput, path: string) =>
				Effect.gen(function* () {
					const content = `${JSON.stringify(output.schema, null, "\t")}\n`;

					const exists = yield* fs.exists(path).pipe(Effect.catchAll(() => Effect.succeed(false)));
					if (exists) {
						const existing = yield* fs.readFileString(path).pipe(
							Effect.mapError(
								(e) =>
									new JsonSchemaError({
										operation: "write",
										name: output.name,
										reason: String(e),
									}),
							),
						);
						const existingParsed = yield* Effect.try({
							try: () => JSON.parse(existing) as unknown,
							catch: () =>
								new JsonSchemaError({
									operation: "write",
									name: output.name,
									reason: "failed to parse existing file",
								}),
						});
						if (deepEqual(existingParsed, output.schema)) {
							return Unchanged(path);
						}
					}

					const lastSlash = path.lastIndexOf("/");
					if (lastSlash > 0) {
						const parentDir = path.slice(0, lastSlash);
						yield* fs.makeDirectory(parentDir, { recursive: true }).pipe(Effect.catchAll(() => Effect.void));
					}

					yield* fs.writeFileString(path, content).pipe(
						Effect.mapError(
							(e) =>
								new JsonSchemaError({
									operation: "write",
									name: output.name,
									reason: String(e),
								}),
						),
					);
					return Written(path);
				});

			return JsonSchemaExporter.of({
				generate: generateOne,

				generateMany: (entries) => Effect.all(entries.map(generateOne)),

				write: writeSingle,

				writeMany: (outputs) => Effect.all(outputs.map(({ output, path }) => writeSingle(output, path))),
			});
		}),
	);
