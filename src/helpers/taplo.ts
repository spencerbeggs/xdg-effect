/**
 * Options for the `taplo()` annotation helper.
 *
 * @public
 */
export interface TaploOptions {
	/** Exclude this schema from completion hints. */
	readonly hidden?: boolean;
	/** Markdown documentation overrides. */
	readonly docs?: {
		/** Primary documentation (overrides standard description). */
		readonly main?: string;
		/** Per-enum-value documentation. Use null to skip an entry. */
		readonly enumValues?: ReadonlyArray<string | null>;
		/** Documentation for the default value. */
		readonly defaultValue?: string;
	};
	/** URL associations for keys and enum values. */
	readonly links?: {
		/** URL for the table key. */
		readonly key?: string;
		/** Per-enum-value URLs. Use null to skip an entry. */
		readonly enumValues?: ReadonlyArray<string | null>;
	};
	/** Field names to suggest during autocompletion alongside required properties. */
	readonly initKeys?: ReadonlyArray<string>;
	/** Escape hatch for undocumented or future extensions. Merges into x-taplo object. */
	readonly custom?: Record<string, unknown>;
}

/**
 * Builds a record with a single `x-taplo` key from typed options.
 *
 * @remarks
 * Pure function for use in Effect Schema `jsonSchema` annotations or
 * `SchemaEntry.annotations`. Compose with `tombi()` via spread.
 *
 * Taplo ignores `x-taplo` when `$ref` is present on the same object.
 * This is a Taplo limitation; the helper does not work around it.
 *
 * @public
 */
export const taplo = (options: TaploOptions): Record<string, unknown> => {
	const obj: Record<string, unknown> = {};
	if (options.hidden !== undefined) obj.hidden = options.hidden;
	if (options.docs !== undefined) obj.docs = options.docs;
	if (options.links !== undefined) obj.links = options.links;
	if (options.initKeys !== undefined) obj.initKeys = options.initKeys;
	if (options.custom) {
		for (const [key, value] of Object.entries(options.custom)) {
			obj[key] = value;
		}
	}
	return { "x-taplo": obj };
};
