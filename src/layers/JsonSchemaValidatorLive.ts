import type { Ajv as AjvInstance, Options as AjvOptions } from "ajv";
import { Effect, Layer } from "effect";
import { JsonSchemaValidationError } from "../errors/JsonSchemaValidationError.js";
import type { JsonSchemaOutput } from "../services/JsonSchemaExporter.js";
// biome-ignore lint/suspicious/noImportCycles: layer intentionally co-locates with its service tag
import type { ValidatorOptions } from "../services/JsonSchemaValidator.js";
// biome-ignore lint/suspicious/noImportCycles: layer intentionally co-locates with its service tag
import { JsonSchemaValidator } from "../services/JsonSchemaValidator.js";

const loadAjv = async (): Promise<new (opts: AjvOptions) => AjvInstance> => {
	// biome-ignore lint/suspicious/noExplicitAny: Ajv CJS/ESM interop — .default varies by bundler/runtime
	const mod = (await import("ajv")) as any;
	// biome-ignore lint/suspicious/noExplicitAny: chained .default unwrap for CJS-in-ESM
	return (mod.default?.default ?? mod.default ?? mod) as any;
};

/**
 * All `x-tombi-*` annotation keywords produced by the `tombi()` helper.
 * Registered with Ajv before compilation so that strict mode does not reject
 * them as unknown keywords.
 */
const TOMBI_KEYWORDS = [
	"x-tombi-additional-key-label",
	"x-tombi-table-keys-order",
	"x-tombi-array-values-order",
	"x-tombi-array-values-order-by",
	"x-tombi-string-formats",
	"x-tombi-toml-version",
] as const;

const checkMissingAdditionalProperties = (schema: Record<string, unknown>, path: string): ReadonlyArray<string> => {
	const errors: string[] = [];

	const walk = (node: unknown, currentPath: string): void => {
		if (node === null || typeof node !== "object" || Array.isArray(node)) return;
		const obj = node as Record<string, unknown>;

		if (obj.type === "object" && obj.properties !== undefined && obj.additionalProperties === undefined) {
			errors.push(
				`${currentPath}: object has "properties" but no "additionalProperties" — Tombi strict mode will treat this as closed`,
			);
		}

		if (obj.$defs && typeof obj.$defs === "object") {
			for (const [key, value] of Object.entries(obj.$defs as Record<string, unknown>)) {
				walk(value, `${currentPath}/$defs/${key}`);
			}
		}
		if (obj.properties && typeof obj.properties === "object") {
			for (const [key, value] of Object.entries(obj.properties as Record<string, unknown>)) {
				walk(value, `${currentPath}/properties/${key}`);
			}
		}
		for (const branch of ["anyOf", "oneOf", "allOf"] as const) {
			if (Array.isArray(obj[branch])) {
				let i = 0;
				for (const item of obj[branch] as unknown[]) {
					walk(item, `${currentPath}/${branch}/${i}`);
					i++;
				}
			}
		}
		for (const keyword of ["if", "then", "else", "not"] as const) {
			if (obj[keyword] !== undefined && typeof obj[keyword] === "object") {
				walk(obj[keyword] as Record<string, unknown>, `${currentPath}/${keyword}`);
			}
		}
		if (obj.items) walk(obj.items, `${currentPath}/items`);
		if (Array.isArray(obj.prefixItems)) {
			let i = 0;
			for (const item of obj.prefixItems as unknown[]) {
				walk(item, `${currentPath}/prefixItems/${i}`);
				i++;
			}
		}
		if (obj.additionalProperties && typeof obj.additionalProperties === "object") {
			walk(obj.additionalProperties, `${currentPath}/additionalProperties`);
		}
	};

	walk(schema, path);
	return errors;
};

export const JsonSchemaValidatorLiveImpl = (): Layer.Layer<JsonSchemaValidator> =>
	Layer.succeed(
		JsonSchemaValidator,
		JsonSchemaValidator.of({
			validate: (output: JsonSchemaOutput, options?: ValidatorOptions) =>
				Effect.gen(function* () {
					const errors: string[] = [];
					const strict = options?.strict ?? false;

					const AjvCtor = yield* Effect.promise(loadAjv);
					const ajv = new AjvCtor({ strict, strictTypes: false, allErrors: true });
					for (const keyword of TOMBI_KEYWORDS) {
						ajv.addKeyword(keyword);
					}
					try {
						ajv.compile(output.schema);
					} catch (e) {
						errors.push(String(e));
					}

					if (strict) {
						const tombiErrors = checkMissingAdditionalProperties(output.schema, "#");
						errors.push(...tombiErrors);
					}

					if (errors.length > 0) {
						return yield* new JsonSchemaValidationError({
							name: output.name,
							errors,
						});
					}

					return output;
				}),

			validateMany: (outputs: ReadonlyArray<JsonSchemaOutput>, options?: ValidatorOptions) =>
				Effect.gen(function* () {
					const allErrors: string[] = [];
					const strict = options?.strict ?? false;
					const AjvCtor = yield* Effect.promise(loadAjv);
					const ajv = new AjvCtor({ strict, strictTypes: false, allErrors: true });
					for (const keyword of TOMBI_KEYWORDS) {
						ajv.addKeyword(keyword);
					}

					for (const output of outputs) {
						try {
							ajv.compile(output.schema);
						} catch (e) {
							allErrors.push(`${output.name}: ${String(e)}`);
						}
						if (strict) {
							const tombiErrors = checkMissingAdditionalProperties(output.schema, `#(${output.name})`);
							allErrors.push(...tombiErrors);
						}
					}

					if (allErrors.length > 0) {
						return yield* new JsonSchemaValidationError({
							name: outputs.map((o) => o.name).join(", "),
							errors: allErrors,
						});
					}

					return [...outputs];
				}),
		}),
	);
