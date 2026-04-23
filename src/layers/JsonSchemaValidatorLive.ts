import type { Ajv as AjvInstance, Options as AjvOptions } from "ajv";
import { Effect, Layer } from "effect";
import { JsonSchemaValidationError } from "../errors/JsonSchemaValidationError.js";
import type { JsonSchemaOutput } from "../services/JsonSchemaExporter.js";
// biome-ignore lint/suspicious/noImportCycles: layer intentionally co-locates with its service tag
import type { ValidatorOptions } from "../services/JsonSchemaValidator.js";
// biome-ignore lint/suspicious/noImportCycles: layer intentionally co-locates with its service tag
import { JsonSchemaValidator } from "../services/JsonSchemaValidator.js";

const loadAjv = (): Effect.Effect<new (opts: AjvOptions) => AjvInstance, JsonSchemaValidationError> =>
	Effect.tryPromise({
		try: async () => {
			// biome-ignore lint/suspicious/noExplicitAny: Ajv CJS/ESM interop — .default varies by bundler/runtime
			const mod = (await import("ajv")) as any;
			return (mod.default?.default ?? mod.default ?? mod) as new (
				opts: AjvOptions,
			) => AjvInstance;
		},
		catch: () =>
			new JsonSchemaValidationError({
				name: "ajv",
				errors: [
					'The "ajv" package is required for JSON Schema validation but is not installed. Install it with: pnpm add ajv',
				],
			}),
	});

interface WalkContext {
	readonly isRoot: boolean;
	readonly insideArrayItems: boolean;
}

interface PlacementRule {
	readonly isValid: (node: Record<string, unknown>, ctx: WalkContext) => boolean;
	readonly reason: string;
}

const PLACEMENT_RULES: Record<string, PlacementRule> = {
	"x-tombi-toml-version": {
		isValid: (_node, ctx) => ctx.isRoot,
		reason: "must appear at schema root only",
	},
	"x-tombi-string-formats": {
		isValid: (_node, ctx) => ctx.isRoot,
		reason: "must appear at schema root only",
	},
	"x-tombi-additional-key-label": {
		isValid: (node) => node.type === "object" && node.additionalProperties !== undefined,
		reason: 'requires an object node with "additionalProperties"',
	},
	"x-tombi-table-keys-order": {
		isValid: (node) => node.type === "object",
		reason: "must appear on an object node",
	},
	"x-tombi-array-values-order": {
		isValid: (node) => node.type === "array" || node.items !== undefined,
		reason: "must appear on an array node",
	},
	"x-tombi-array-values-order-by": {
		isValid: (node, ctx) => node.type === "object" && ctx.insideArrayItems,
		reason: "must appear on an object node inside array items",
	},
	"x-taplo": {
		isValid: (node) => node.$ref === undefined,
		reason: "ignored when $ref is present (likely a mistake)",
	},
};

const EXTENSION_KEYWORDS = Object.keys(PLACEMENT_RULES);

const checkSchemaConventions = (
	schema: Record<string, unknown>,
	path: string,
	strict: boolean,
): ReadonlyArray<string> => {
	const errors: string[] = [];

	const walk = (node: unknown, currentPath: string, ctx: WalkContext): void => {
		if (node === null || typeof node !== "object" || Array.isArray(node)) return;
		const obj = node as Record<string, unknown>;

		// Annotation placement checks (always run)
		for (const key of Object.keys(obj)) {
			const rule = PLACEMENT_RULES[key];
			if (rule && !rule.isValid(obj, ctx)) {
				errors.push(`${currentPath}: "${key}" ${rule.reason}`);
			}
		}

		// Strict-mode: additionalProperties check
		if (strict && obj.type === "object" && obj.properties !== undefined && obj.additionalProperties === undefined) {
			errors.push(
				`${currentPath}: object has "properties" but no "additionalProperties" — Tombi strict mode will treat this as closed`,
			);
		}

		const childCtx: WalkContext = { isRoot: false, insideArrayItems: false };

		if (obj.$defs && typeof obj.$defs === "object") {
			for (const [key, value] of Object.entries(obj.$defs as Record<string, unknown>)) {
				walk(value, `${currentPath}/$defs/${key}`, childCtx);
			}
		}
		if (obj.properties && typeof obj.properties === "object") {
			for (const [key, value] of Object.entries(obj.properties as Record<string, unknown>)) {
				walk(value, `${currentPath}/properties/${key}`, childCtx);
			}
		}
		for (const branch of ["anyOf", "oneOf", "allOf"] as const) {
			if (Array.isArray(obj[branch])) {
				let i = 0;
				for (const item of obj[branch] as unknown[]) {
					walk(item, `${currentPath}/${branch}/${i}`, childCtx);
					i++;
				}
			}
		}
		for (const keyword of ["if", "then", "else", "not"] as const) {
			if (obj[keyword] !== undefined && typeof obj[keyword] === "object") {
				walk(obj[keyword] as Record<string, unknown>, `${currentPath}/${keyword}`, childCtx);
			}
		}

		// Children of items/prefixItems are direct array element schemas
		const arrayChildCtx: WalkContext = { isRoot: false, insideArrayItems: true };
		if (obj.items) walk(obj.items, `${currentPath}/items`, arrayChildCtx);
		if (Array.isArray(obj.prefixItems)) {
			let i = 0;
			for (const item of obj.prefixItems as unknown[]) {
				walk(item, `${currentPath}/prefixItems/${i}`, arrayChildCtx);
				i++;
			}
		}

		if (obj.additionalProperties && typeof obj.additionalProperties === "object") {
			walk(obj.additionalProperties, `${currentPath}/additionalProperties`, childCtx);
		}
	};

	walk(schema, path, { isRoot: true, insideArrayItems: false });
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

					const AjvCtor = yield* loadAjv();
					const ajv = new AjvCtor({ strict, strictTypes: false, allErrors: true });
					for (const keyword of EXTENSION_KEYWORDS) {
						ajv.addKeyword(keyword);
					}
					try {
						ajv.compile(output.schema);
					} catch (e) {
						errors.push(String(e));
					}

					const conventionErrors = checkSchemaConventions(output.schema, "#", strict);
					errors.push(...conventionErrors);

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
					const AjvCtor = yield* loadAjv();
					const ajv = new AjvCtor({ strict, strictTypes: false, allErrors: true });
					for (const keyword of EXTENSION_KEYWORDS) {
						ajv.addKeyword(keyword);
					}

					for (const output of outputs) {
						try {
							ajv.compile(output.schema);
						} catch (e) {
							allErrors.push(`${output.name}: ${String(e)}`);
						}
						const conventionErrors = checkSchemaConventions(output.schema, `#(${output.name})`, strict);
						allErrors.push(...conventionErrors);
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
